// Утиліта для логування з транслітерацією українського тексту
// Вирішує проблему кодування в Windows PowerShell

const translitMap = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh', 
  'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'H', 'Ґ': 'G', 'Д': 'D', 'Е': 'E', 'Є': 'Ye', 'Ж': 'Zh',
  'З': 'Z', 'И': 'Y', 'І': 'I', 'Ї': 'Yi', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
  'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts',
  'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ь': '', 'Ю': 'Yu', 'Я': 'Ya'
};

function translit(text) {
  if (typeof text !== 'string') return text;
  return text.split('').map(char => translitMap[char] || char).join('');
}

function log(...args) {
  const translitArgs = args.map(arg => {
    if (typeof arg === 'string') {
      return translit(arg);
    }
    return arg;
  });
  console.log(...translitArgs);
}

function error(...args) {
  const translitArgs = args.map(arg => {
    if (typeof arg === 'string') {
      return translit(arg);
    }
    return arg;
  });
  console.error(...translitArgs);
}

function warn(...args) {
  const translitArgs = args.map(arg => {
    if (typeof arg === 'string') {
      return translit(arg);
    }
    return arg;
  });
  console.warn(...translitArgs);
}

module.exports = { log, error, warn, translit };
