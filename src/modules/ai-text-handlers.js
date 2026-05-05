import { ipcMain } from 'electron';

function registerTextHandlers(groqClient) {
  ipcMain.handle('predict-completion', async (event, text) => {
    const input = String(text || '').trim();
    if (!input) return '';

    const lastTokenMatch = input.match(/(\S+)$/);
    const lastToken = lastTokenMatch ? lastTokenMatch[1] : '';
    if (lastToken.length < 2) return '';

    if (!groqClient) return '';

    try {
      const completion = await groqClient.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `Ти модуль автодоповнення тексту. Поверни ОДНЕ завершене слово для останнього фрагмента. Без пояснень, без markdown, без пунктуації навколо.`
          },
          {
            role: 'user',
            content: `Контекст: ${input}\nФрагмент: ${lastToken}`
          }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        max_tokens: 10
      });

      const raw = completion.choices[0]?.message?.content || '';
      let candidate = raw.replace(/[\r\n]+/g, ' ').trim().split(/\s+/)[0] || '';
      candidate = candidate.replace(/^[^a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ0-9'-]+|[^a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ0-9'-]+$/g, '');

      return candidate || '';
    } catch (error) {
      console.warn('[AI] predict-completion error:', error.message);
      return '';
    }
  });

  ipcMain.handle('ask-ai', async (event, prompt) => {
    if (!groqClient) {
      throw new Error('AI не ініціалізовано. Перевірте API ключ у .env файлі');
    }

    try {
      const completion = await groqClient.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 2048
      });

      return completion.choices[0]?.message?.content || 'Error: no response received';
    } catch (error) {
      console.error('[AI] Groq API error:', error);
      throw new Error(`Не вдалося отримати відповідь від AI: ${error.message}`);
    }
  });
}

export { registerTextHandlers };
