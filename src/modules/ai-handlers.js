import { ipcMain } from 'electron';
import { registerTextHandlers } from './ai-text-handlers.js';
import { registerFeedHandler } from './ai-feed-handler.js';
import { registerXrayHandler } from './ai-xray-handler.js';

function registerAIHandlers(groqClient, infiniteArticleGenerator, tabManager) {
  registerTextHandlers(groqClient);
  registerFeedHandler(groqClient, infiniteArticleGenerator);
  registerXrayHandler(groqClient);

  ipcMain.handle('organize-tabs', async (event) => {
    try {
      if (!groqClient) {
        return { success: false, message: 'AI не ініціалізовано. Перевірте API ключ у .env' };
      }

      const allTabs = tabManager.getAllTabs();
      if (allTabs.length < 2) {
        return { success: false, message: 'Занадто мало вкладок для організації (потрібно хоча б 2)' };
      }

      const tabsData = await Promise.all(allTabs.map(async (tab) => {
        try {
          const title = tab.browserView.webContents.getTitle() || 'Без назви';
          const url = tab.browserView.webContents.getURL() || '';
          return { id: tab.id, title, url };
        } catch {
          return { id: tab.id, title: 'Load error', url: '' };
        }
      }));

      const tabsListString = tabsData.map(t => `ID: ${t.id}, Title: "${t.title}", URL: "${t.url}"`).join('\n');
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

      const responseText = completion.choices[0]?.message?.content?.trim();
      if (!responseText) {
        return { success: false, message: 'Помилка отримання відповіді від AI' };
      }

      const cleaned = responseText.replace(/```json|```/g, '').trim();
      let groupsData;
      try {
        groupsData = JSON.parse(cleaned);
      } catch {
        return { success: false, message: 'AI повернув некоректний формат' };
      }

      return { success: true, groups: groupsData.groups, tabsData };
    } catch (error) {
      console.error('[AI] Tab organization error:', error);
      return { success: false, message: error.message };
    }
  });

  console.log('[IPC] AI handlers registered');
}

export { registerAIHandlers };
