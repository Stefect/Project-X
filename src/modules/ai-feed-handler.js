import { ipcMain } from 'electron';
import memoize from '../utils/memoize.js';
import { createLogDecorator } from '../utils/log-decorator.js';

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
          role: 'system',
          content: `Ти - перекладач новин. Твоє завдання:
1. Переклади заголовок статті на українську мову
2. Створи коротке резюме (1 речення, до 15 слів)

Поверни відповідь СТРОГО у форматі JSON без markdown:
{"title": "Перекладений заголовок", "summary": "Коротке резюме"}`
        },
        {
          role: 'user',
          content: `Переклади: ${title}`
        }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: 150
    });

    const responseText = completion.choices[0]?.message?.content || '';

    try {
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        translatedTitle: parsed.title || title,
        summary: parsed.summary || `Аналіз: ${title.substring(0, 30)}...`
      };
    } catch {
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

function registerFeedHandler(groqClient, infiniteArticleGenerator) {
  const log = createLogDecorator({
    level: 'DEBUG',
    formatter: (entry) => `[AI] ${entry.event} ${entry.label}${entry.durationMs != null ? ` ${entry.durationMs}ms` : ''}${entry.error ? ` — ${entry.error.message}` : ''}`
  });

  const cachedSummarizeArticle = memoize(
    log((title) => summarizeArticle(title, groqClient), { label: 'summarize', level: 'DEBUG' }),
    { maxSize: 100, policy: 'lru' }
  );

  ipcMain.handle('start-infinite-feed', async (event, categories = ['all']) => {
    if (isFeedRunning) {
      return { success: false, message: 'Стрічка вже активна' };
    }

    if (!Array.isArray(categories)) {
      categories = [categories];
    }

    isFeedRunning = true;
    currentFeedGenerator = infiniteArticleGenerator(categories);

    (async () => {
      for await (const article of currentFeedGenerator) {
        if (!isFeedRunning) break;

        try {
          const result = await Promise.race([
            cachedSummarizeArticle(article.title),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 5000))
          ]);

          event.sender.send('new-feed-item', {
            ...article,
            title: result.translatedTitle,
            summary: result.summary
          });
        } catch (error) {
          if (error.message === 'AI_TIMEOUT') {
            event.sender.send('feed-timeout-skip', article.source);
          } else {
            console.error('[AI] Feed processing error:', error.message);
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

    return { success: true, message: 'Стрічка зупинена' };
  });
}

export { registerFeedHandler };
