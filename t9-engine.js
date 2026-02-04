// T9 Engine - система предиктивного ввода текста
(function() {
  'use strict';

  // Словарь часто используемых слов (можно расширять)
  const dictionary = {
    ru: [
      'привет', 'пока', 'спасибо', 'здравствуйте', 'добрый', 'утро', 'день', 'вечер', 'ночь',
      'как', 'дела', 'что', 'где', 'когда', 'почему', 'кто', 'какой', 'который', 'сколько',
      'время', 'работа', 'дом', 'семья', 'друзья', 'любовь', 'жизнь', 'человек', 'год', 'день',
      'хорошо', 'плохо', 'можно', 'нужно', 'надо', 'хочу', 'могу', 'должен', 'буду', 'был',
      'есть', 'нет', 'да', 'очень', 'много', 'мало', 'больше', 'меньше', 'лучше', 'хуже',
      'сейчас', 'потом', 'завтра', 'вчера', 'сегодня', 'всегда', 'никогда', 'иногда', 'часто',
      'делать', 'говорить', 'думать', 'знать', 'видеть', 'слышать', 'понимать', 'хотеть', 'мочь',
      'большой', 'маленький', 'новый', 'старый', 'хороший', 'плохой', 'красивый', 'умный',
      'интересно', 'важно', 'нужно', 'можно', 'нельзя', 'правильно', 'неправильно',
      'пожалуйста', 'извините', 'прости', 'простите', 'спасибо', 'благодарю',
      'компьютер', 'интернет', 'программа', 'файл', 'документ', 'текст', 'сообщение',
      'вопрос', 'ответ', 'проблема', 'решение', 'результат', 'информация', 'данные',
      'сайт', 'страница', 'ссылка', 'поиск', 'браузер', 'приложение', 'система'
    ],
    en: [
      'hello', 'goodbye', 'thanks', 'thank', 'please', 'sorry', 'yes', 'no', 'maybe',
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I', 'it', 'for', 'not',
      'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from',
      'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would',
      'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which',
      'go', 'me', 'when', 'make', 'can', 'like', 'time', 'just', 'him', 'know', 'take',
      'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
      'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
      'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
      'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
      'computer', 'internet', 'program', 'file', 'document', 'text', 'message',
      'question', 'answer', 'problem', 'solution', 'result', 'information', 'data',
      'website', 'page', 'link', 'search', 'browser', 'application', 'system'
    ]
  };

  // История последних введенных слов пользователем
  let userHistory = [];
  const MAX_HISTORY = 100;

  // Определение языка текста
  function detectLanguage(text) {
    const cyrillicPattern = /[а-яёА-ЯЁ]/;
    return cyrillicPattern.test(text) ? 'ru' : 'en';
  }

  // Получение слов для текущего языка
  function getWords(text) {
    const lang = detectLanguage(text);
    return [...dictionary[lang], ...userHistory];
  }

  // Добавление слова в историю
  function addToHistory(word) {
    if (word.length < 2) return;
    
    // Удаляем дубликаты
    userHistory = userHistory.filter(w => w !== word);
    // Добавляем в начало
    userHistory.unshift(word);
    // Ограничиваем размер
    if (userHistory.length > MAX_HISTORY) {
      userHistory = userHistory.slice(0, MAX_HISTORY);
    }
  }

  // Вычисление расстояния Левенштейна (для более точных подсказок)
  function levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // Получение предложений (основная функция T9)
  window.T9Engine = {
    getSuggestions: function(input, maxSuggestions = 5) {
      if (!input || input.length < 1) return [];

      const inputLower = input.toLowerCase().trim();
      const words = getWords(input);
      
      // Фильтруем слова
      let matches = words.filter(word => {
        const wordLower = word.toLowerCase();
        return wordLower.startsWith(inputLower) && word !== input;
      });

      // Если точных совпадений мало, добавляем похожие слова
      if (matches.length < maxSuggestions) {
        const similar = words
          .filter(word => !matches.includes(word))
          .map(word => ({
            word: word,
            distance: levenshteinDistance(inputLower, word.toLowerCase().substring(0, inputLower.length))
          }))
          .filter(item => item.distance <= 2)
          .sort((a, b) => a.distance - b.distance)
          .map(item => item.word);
        
        matches = [...matches, ...similar];
      }

      // Убираем дубликаты и ограничиваем количество
      matches = [...new Set(matches)].slice(0, maxSuggestions);

      return matches;
    },

    // Получение завершений фраз
    getPhraseSuggestions: function(text) {
      const phrases = {
        ru: {
          'как дела': ['как дела?', 'как дела у тебя?', 'как дела, как сам?'],
          'добрый': ['добрый день', 'добрый вечер', 'доброе утро'],
          'спасибо': ['спасибо большое', 'спасибо за помощь', 'спасибо тебе'],
          'пожалуйста': ['пожалуйста!', 'пожалуйста, помоги', 'пожалуйста, скажи'],
          'что': ['что делаешь?', 'что нового?', 'что случилось?'],
          'где': ['где ты?', 'где это?', 'где находится?'],
          'когда': ['когда будет?', 'когда встретимся?', 'когда начнем?']
        },
        en: {
          'how are': ['how are you?', 'how are you doing?', 'how are things?'],
          'thank': ['thank you', 'thank you very much', 'thanks a lot'],
          'good': ['good morning', 'good afternoon', 'good evening', 'good night'],
          'what': ['what\'s up?', 'what\'s new?', 'what happened?'],
          'where': ['where are you?', 'where is it?', 'where to go?'],
          'when': ['when will it be?', 'when do we start?', 'when can I?']
        }
      };

      const textLower = text.toLowerCase().trim();
      const lang = detectLanguage(text);
      const langPhrases = phrases[lang] || {};

      for (let key in langPhrases) {
        if (textLower.endsWith(key)) {
          return langPhrases[key];
        }
      }

      return [];
    },

    // Запоминание введенного слова
    learnWord: function(word) {
      addToHistory(word);
    },

    // Очистка истории
    clearHistory: function() {
      userHistory = [];
    },

    // Экспорт истории
    exportHistory: function() {
      return [...userHistory];
    },

    // Импорт истории
    importHistory: function(history) {
      if (Array.isArray(history)) {
        userHistory = [...history];
      }
    }
  };

  console.log('✓ T9 Engine загружен');
})();
