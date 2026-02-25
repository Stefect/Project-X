/**
 * AI Handlers - IPC обробники для AI функціоналу
 * Notes summarization, Tab organization, Infinite Feed
 */

const { ipcMain } = require('electron');

let isFeedRunning = false;
let currentFeedGenerator = null;

/**
 * Самаризує заголовок статті через AI
 */
async function summarizeArticle(title, groqClient) {
  if (!groqClient) {
    return `Стаття про: ${title.substring(0, 50)}...`;
  }
  
  try {
    const completion = await groqClient.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are a news summarizer. Create ONE short sentence (max 15 words) summarizing the article title. Be concise and engaging. Answer in Ukrainian." 
        },
        { 
          role: "user", 
          content: `Summarize: ${title}` 
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 50
    });
    return completion.choices[0]?.message?.content || `Аналіз: ${title.substring(0, 30)}...`;
  } catch (error) {
    console.error('[AI] Summary error:', error.message);
    return `${title.substring(0, 60)}...`;
  }
}

/**
 * Реєструє AI IPC handlers
 */
function registerAIHandlers(groqClient, infiniteArticleGenerator, tabManager) {
  
  // ==================== NOTES SUMMARIZATION ====================
  
  ipcMain.handle('ask-gemini', async (event, prompt) => {
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

  // ==================== TAB ORGANIZATION ====================
  
  ipcMain.handle('organize-tabs', async (event) => {
    try {
      console.log('[AI] Organizing tabs...');

      if (!groqClient) {
        return { 
          success: false, 
          message: '❌ AI не ініціалізовано. Перевірте API ключ у .env' 
        };
      }

      const allTabs = tabManager.getAllTabs();
      
      if (allTabs.length < 2) {
        return { 
          success: false, 
          message: '⚠️ Занадто мало вкладок для організації (потрібно хоча б 2)' 
        };
      }

      // Збираємо інформацію про всі вкладки
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

      console.log('[AI] Analyzing tabs via Groq...');

      const completion = await groqClient.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        max_tokens: 1000
      });

      let responseText = completion.choices[0]?.message?.content?.trim();

      if (!responseText) {
        return { 
          success: false, 
          message: '❌ Помилка отримання відповіді від AI' 
        };
      }

      // Чистимо markdown теги
      responseText = responseText.replace(/```json|```/g, '').trim();

      let groupsData;
      try {
        groupsData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[AI] JSON parsing error:', responseText);
        return { 
          success: false, 
          message: '❌ AI повернув некоректний формат' 
        };
      }

      console.log('[AI] Organization ready:', groupsData);
      return { 
        success: true, 
        groups: groupsData.groups,
        tabsData: tabsData
      };

    } catch (error) {
      console.error('[AI] Tab organization error:', error);
      return { 
        success: false, 
        message: `❌ ${error.message}` 
      };
    }
  });

  // ==================== INFINITE FEED ====================
  
  ipcMain.handle('start-infinite-feed', async (event, categories = ['all'], customSources = []) => {
    if (isFeedRunning) {
      console.log('[FEED] Already running');
      return { success: false, message: 'Feed is already active' };
    }
    
    if (!Array.isArray(categories)) {
      categories = [categories];
    }
    
    isFeedRunning = true;
    currentFeedGenerator = infiniteArticleGenerator(categories, customSources);
    console.log(`[FEED] Starting for categories: ${categories.join(', ')}`);
    
    if (customSources && customSources.length > 0) {
      console.log(`[FEED] Custom sources: ${customSources.length}`);
    }

    // Асинхронна обробка статей
    (async () => {
      for await (const article of currentFeedGenerator) {
        if (!isFeedRunning) {
          console.log('[FEED] Stopped by user');
          break;
        }

        console.log(`[FEED] Received: ${article.title.substring(0, 50)}...`);

        try {
          // Timeout 3 секунди для AI обробки
          const summary = await Promise.race([
            summarizeArticle(article.title, groqClient),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('AI_TIMEOUT')), 3000)
            )
          ]);

          console.log(`[FEED] AI processed: ${summary.substring(0, 30)}...`);
          event.sender.send('new-feed-item', { ...article, summary });

        } catch (error) {
          if (error.message === 'AI_TIMEOUT') {
            console.log(`[FEED] AI timeout (>3 sec). Skipping ${article.source}`);
            event.sender.send('feed-timeout-skip', article.source);
          } else {
            console.error('[FEED] Processing error:', error.message);
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
    console.log('[FEED] Stopped');
    
    return { success: true, message: 'Стрічка зупинена' };
  });

  console.log('[IPC] AI handlers registered');
}

module.exports = {
  registerAIHandlers
};
