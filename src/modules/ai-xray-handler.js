import { ipcMain } from 'electron';
import memoize from '../utils/memoize.js';

async function describeURL(url, linkText, context, groqClient) {
  if (!url || url.startsWith('file://') || url.startsWith('javascript:') || url.startsWith('#')) {
    return null;
  }

  if (!groqClient) {
    const domain = new URL(url).hostname;
    return { title: linkText || domain, description: `Перейти на ${domain}` };
  }

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

  try {
    const cleanJson = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch {
    const domain = new URL(url).hostname;
    return { title: domain, description: responseText.substring(0, 60) || `Посилання на ${domain}` };
  }
}

function registerXrayHandler(groqClient) {
  const cachedDescribeURL = memoize(
    (url, linkText, context) => describeURL(url, linkText, context, groqClient),
    { maxSize: 200, policy: 'lru' }
  );

  ipcMain.handle('describe-url', async (event, url, linkText, context) => {
    try {
      return await cachedDescribeURL(url, linkText, context);
    } catch (error) {
      console.error('[AI] x-ray error:', error.message);
      try {
        const domain = new URL(url).hostname;
        return { title: domain, description: `Перейти на ${domain}` };
      } catch {
        return null;
      }
    }
  });
}

export { registerXrayHandler };
