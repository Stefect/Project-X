// AI обробники для резюме та стрічки
const { ipcMain } = require('electron');
const memoize = require('../utils/memoize');

let isFeedRunning = false;
let currentFeedGenerator = null;

async function summarizeArticle(title, groqClient) {
  if (!groqClient) {
    return {
      translatedTitle: title,
      summary: `Стаття про: ${title.substring(0, 50)}...`
    };
  }
  
  try {
    const completion = await groqClient.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: `Ти - перекладач новин. Твоє завдання:
1. Переклади заголовок статті на українську мову
2. Створи коротке резюме (1 речення, до 15 слів)

Поверни відповідь СТРОГО у форматі JSON без markdown:
{"title": "Перекладений заголовок", "summary": "Коротке резюме"}` 
        },
        { 
          role: "user", 
          content: `Переклади: ${title}` 
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 150
    });
    
    const responseText = completion.choices[0]?.message?.content || '';
    
    try {
      // Пробуємо розпарсити JSON
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        translatedTitle: parsed.title || title,
        summary: parsed.summary || `Аналіз: ${title.substring(0, 30)}...`
      };
    } catch (parseError) {
      // Якщо не вдалось розпарсити, використовуємо просто як summary
      return {
        translatedTitle: title,
        summary: responseText || `Аналіз: ${title.substring(0, 30)}...`
      };
    }
  } catch (error) {
    console.error('[AI] Summary error:', error.message);
    return {
      translatedTitle: title,
      summary: `${title.substring(0, 60)}...`
    };
  }
}

// реєстрація AI IPC handlers
function registerAIHandlers(groqClient, infiniteArticleGenerator, tabManager) {

  const cachedSummarizeArticle = memoize(
    (title) => summarizeArticle(title, groqClient),
    { maxSize: 100, policy: 'lru' }
  );

  // резюмування нотаток
  
  ipcMain.handle('ask-ai', async (event, prompt) => {
    try {
      if (!groqClient) {
        throw new Error('AI не ініціалізовано. Перевірте API ключ у .env файлі');
      }

      console.log('[AI] Notes summary request...');
      
      const completion = await groqClient.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 2048
      });
      
      const text = completion.choices[0]?.message?.content || 'Error: no response received';
      console.log('[AI] Response received from Groq');
      return text;
    } catch (error) {
      console.error('[AI] Groq API error:', error);
      throw new Error(`Не вдалося отримати відповідь від AI: ${error.message}`);
    }
  });

  // організація вкладок
  
  ipcMain.handle('organize-tabs', async (event) => {
    try {
      if (!groqClient) {
        return {
          success: false,
          message: 'AI не ініціалізовано. Перевірте API ключ у .env'
        };
      }

      const allTabs = tabManager.getAllTabs();

      if (allTabs.length < 2) {
        return {
          success: false,
          message: 'Занадто мало вкладок для організації (потрібно хоча б 2)'
        };
      }

      const tabsData = await Promise.all(allTabs.map(async (tab) => {
        try {
          const title = tab.browserView.webContents.getTitle() || 'Без назви';
          const url = tab.browserView.webContents.getURL() || '';
          return { id: tab.id, title, url };
        } catch (error) {
          return { id: tab.id, title: 'Load error', url: '' };
        }
      }));

      const tabsListString = tabsData.map(t => `ID: ${t.id}, Title: "${t.title}", URL: "${t.url}"`).join('\n');

      // Промпт для AI
      const prompt = `Ти — менеджер вкладок браузера. Я дам тобі список відкритих вкладок.
Твоє завдання: згрупувати їх за змістом та тематикою.

ВАЖЛИВО: Поверни відповідь ТІЛЬКИ у форматі JSON, без markdown, пояснень та зайвого тексту.

Формат відповіді:
{
  "groups": [
    { "name": "Назва групи українською (Навчання, Робота, YouTube, Соцмережі, Кодинг, Новини, Розваги тощо)", "tabIds": [1, 5, 7] },
    { "name": "Інша група", "tabIds": [2, 3] }
  ]
}

Правила:
- Кожна вкладка має бути в якійсь групі
- Назви груп пиши українською
- Групуй за змістом: навчання разом, розваги разом, новини разом тощо
- Якщо вкладка не підходить нікуди - створи групу "Інше"

Список вкладок:
${tabsListString}`;

      const completion = await groqClient.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        max_tokens: 1000
      });

      console.log('[AI] Groq API response received');
      let responseText = completion.choices[0]?.message?.content?.trim();
      console.log('[AI] Raw response:', responseText?.substring(0, 200) + '...');

      if (!responseText) {
        console.error('[AI] Empty response from Groq');
        return { 
          success: false, 
          message: 'Помилка отримання відповіді від AI' 
        };
      }

      // Чистимо markdown теги
      responseText = responseText.replace(/```json|```/g, '').trim();
      console.log('[AI] Cleaned response:', responseText?.substring(0, 150) + '...');

      let groupsData;
      try {
        groupsData = JSON.parse(responseText);
        console.log('[AI] JSON parsed successfully:', Object.keys(groupsData));
      } catch (parseError) {
        console.error('[AI] JSON parsing error:', parseError.message);
        console.error('[AI] Failed to parse:', responseText);
        return { 
          success: false, 
          message: 'AI повернув некоректний формат' 
        };
      }

      console.log('[AI] Organization ready! Groups:', groupsData.groups?.length);
      
      const resultToReturn = { 
        success: true, 
        groups: groupsData.groups,
        tabsData: tabsData
      };
      
      console.log('[AI] Returning to frontend:', JSON.stringify(resultToReturn, null, 2).substring(0, 300));
      return resultToReturn;

    } catch (error) {
      console.error('[AI] Tab organization error:', error);
      return { 
        success: false, 
        message: `${error.message}` 
      };
    }
  });

  // нескінченна стрічка

  ipcMain.handle('start-infinite-feed', async (event, categories = ['all'], customSources = []) => {
    if (isFeedRunning) {
      console.log('стрічка вже працює');
      return { success: false, message: 'Стрічка вже активна' };
    }
    
    if (!Array.isArray(categories)) {
      categories = [categories];
    }
    
    isFeedRunning = true;
    currentFeedGenerator = infiniteArticleGenerator(categories, customSources);
    console.log(`стрічка Starting for categories: ${categories.join(', ')}`);
    
    if (customSources && customSources.length > 0) {
      console.log(`стрічка Custom sources: ${customSources.length}`);
    }

    // таймаут для обробки статей
    
    (async () => {
      // for await - споживає async generator infiniteArticleGenerator
      for await (const article of currentFeedGenerator) {
        if (!isFeedRunning) {
          console.log('стрічка Stopped by user');
          break;
        }

        console.log(`стрічка Received: ${article.title.substring(0, 50)}...`);

        try {
          // Promise.race - таймаут 5 секунд для перекладу та AI обробки
          const result = await Promise.race([
            cachedSummarizeArticle(article.title),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('AI_TIMEOUT')), 5000)
            )
          ]);

          console.log(`стрічка AI processed: ${result.summary.substring(0, 30)}...`);
          event.sender.send('new-feed-item', { 
            ...article, 
            title: result.translatedTitle,
            summary: result.summary 
          });

        } catch (error) {
          if (error.message === 'AI_TIMEOUT') {
            console.log(`стрічка AI timeout (>3 sec). Skipping ${article.source}`);
            event.sender.send('feed-timeout-skip', article.source);
          } else {
            console.error('стрічка Processing error:', error.message);
          }
        }
      }
    })();
    
    return { success: true, message: 'Стрічка запущена' };
  });

  ipcMain.handle('stop-infinite-feed', () => {
    if (!isFeedRunning) {
      return { success: false, message: 'Стрічка не активна' };
    }
    
    isFeedRunning = false;
    currentFeedGenerator = null;
    console.log('стрічка Stopped');
    
    return { success: true, message: 'Стрічка зупинена' };
  });

  // X-RAY опис посилань

  // функція для опису URL через AI
  async function describeURL(url, linkText, context) {
    if (!url || url.startsWith('file://') || url.startsWith('javascript:') || url.startsWith('#')) {
      return null;
    }

    if (!groqClient) {
      // Без AI — показуємо текст посилання або домен
      const domain = new URL(url).hostname;
      const title = linkText || domain;
      return { title, description: `Перейти на ${domain}` };
    }

    console.log('x-ray Describing:', url.substring(0, 80));
    if (linkText) console.log('x-ray Link text:', linkText.substring(0, 60));
    if (context) console.log('x-ray Context:', context.substring(0, 80));

    // Формуємо запит з контекстом
    let userMessage = `URL: ${url}`;
    if (linkText && linkText.trim()) {
      userMessage += `\nТекст посилання: «${linkText.trim()}»`;
    }
    if (context && context.trim()) {
      userMessage += `\nКонтекст на сторінці: ${context.trim()}`;
    }

    const completion = await groqClient.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Ти — X-Ray помічник браузера. Користувач навів мишку на посилання. Тобі надано URL, текст посилання і контекст зі сторінки.

ГОЛОВНЕ ЗАВДАННЯ: Опиши ЩО ЗНАХОДИТЬСЯ НА СТОРІНЦІ за посиланням, а НЕ як це стосується поточної сторінки.

ПРАВИЛА:
- Описуй ЦІЛЬОВУ сторінку: що користувач побачить, якщо натисне на посилання
- Контекст зі сторінки використовуй ТІЛЬКИ для ідентифікації цільової сторінки, НЕ для зміни опису
- Якщо посилання веде на сторінку Вікіпедії про рік 1886, пиши "Стаття Вікіпедії про 1886 рік", а НЕ "рік смерті когось"
- Не вигадуй інформацію. Описуй лише те, що точно буде на цільовій сторінці
- Пиши мовою тексту посилання/URL. Якщо не зрозуміло — українською
- title — назва цільової сторінки (2-6 слів). description — що на ній знаходиться (до 15 слів)

Поверни ТІЛЬКИ JSON, без markdown та пояснень:
{"title": "...", "description": "..."}`
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 120
    });

    const responseText = completion.choices[0]?.message?.content || '';
    let result;

    try {
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      result = JSON.parse(cleanJson);
    } catch (parseError) {
      const domain = new URL(url).hostname;
      result = { title: domain, description: responseText.substring(0, 60) || `Посилання на ${domain}` };
    }

    console.log('x-ray Result:', result.title);
    return result;
  }

  // мемоізація для describeURL
  // багато посилань повторюються
  const cachedDescribeURL = memoize(describeURL, {
    maxSize: 200,
    policy: 'lru'
  });
  console.log('створив кешовану версію describeURL');

  ipcMain.handle('describe-url', async (event, url, linkText, context) => {
    try {
      return await cachedDescribeURL(url, linkText, context);
    } catch (error) {
      console.error('x-ray Error:', error.message);
      try {
        const domain = new URL(url).hostname;
        return { title: domain, description: `Перейти на ${domain}` };
      } catch {
        return null;
      }
    }
  });

  console.log('[IPC] AI handlers registered');
}

module.exports = {
  registerAIHandlers
};
