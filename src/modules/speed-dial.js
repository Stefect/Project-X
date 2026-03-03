// ============================================
// SPEED DIAL MODULE - Модуль швидкого доступу
// ============================================

// Палітра кольорів Tailwind для карток
const availableColors = [
  'bg-red-600', 'bg-orange-500', 'bg-green-600', 
  'bg-blue-600', 'bg-indigo-600', 'bg-purple-600', 'bg-gray-800'
];

let savedLinks = JSON.parse(localStorage.getItem('projectX_speedDial')) || [];
let currentEditingIndex = null; // null якщо створюємо нову, число - якщо редагуємо
let selectedColor = availableColors[4]; // Дефолтний колір (indigo)

let speedDialContainer;
let modal;
let modalTitle;
let colorPickerContainer;
let linkTitleInput;
let linkUrlInput;
let linkIconInput;
let cancelModalBtn;
let saveLinkBtn;

// Ініціалізація модуля
function initSpeedDial() {
  // Отримуємо посилання на елементи DOM
  speedDialContainer = document.getElementById('speed-dial');
  modal = document.getElementById('edit-modal');
  modalTitle = document.getElementById('modal-title');
  colorPickerContainer = document.getElementById('color-picker');
  linkTitleInput = document.getElementById('link-title');
  linkUrlInput = document.getElementById('link-url');
  linkIconInput = document.getElementById('link-icon');
  cancelModalBtn = document.getElementById('cancel-modal-btn');
  saveLinkBtn = document.getElementById('save-link-btn');

  // Перевірка наявності елементів
  if (!speedDialContainer || !modal) {
    console.error('[Speed Dial] Required elements not found');
    return;
  }

  // Підключаємо обробники подій
  if (cancelModalBtn) {
    cancelModalBtn.addEventListener('click', closeModal);
  }
  
  if (saveLinkBtn) {
    saveLinkBtn.addEventListener('click', saveLink);
  }

  // Закриття модального вікна по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Рендер початкових карток
  renderSpeedDial();
  
  console.log('[Speed Dial] Initialized successfully');
}

// 1. Рендер карток
function renderSpeedDial() {
  if (!speedDialContainer) return;
  
  speedDialContainer.innerHTML = '';

  savedLinks.forEach((link, index) => {
    const card = document.createElement('div');
    // Робимо саму картку посиланням, але додаємо кнопки керування
    card.className = `${link.bgColor} gx-card h-32 flex flex-col items-center justify-center text-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200 cursor-pointer relative group`;
    
    card.innerHTML = `
      <a href="${escapeHtml(link.url)}" class="absolute inset-0 flex flex-col items-center justify-center z-10">
        <div class="text-4xl mb-2 drop-shadow-lg">${escapeHtml(link.icon || '🌐')}</div>
        <span class="font-bold text-sm tracking-wide drop-shadow-md">${escapeHtml(link.title)}</span>
      </a>
      
      <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button class="edit-link-btn p-1 bg-black/40 hover:bg-black/70 rounded text-xs text-white" data-index="${index}" title="Редагувати">✏️</button>
        <button class="delete-link-btn p-1 bg-black/40 hover:bg-red-500/80 rounded text-xs text-white" data-index="${index}" title="Видалити">✖</button>
      </div>
    `;
    
    // Додаємо обробники для кнопок редагування та видалення
    const editBtn = card.querySelector('.edit-link-btn');
    const deleteBtn = card.querySelector('.delete-link-btn');
    
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(index);
      });
    }
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteLink(index);
      });
    }
    
    speedDialContainer.appendChild(card);
  });

  // Кнопка "+"
  const addBtn = document.createElement('div');
  addBtn.className = 'bg-gray-800/60 hover:bg-gray-700 border-2 border-dashed border-gray-600 gx-card h-32 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200 cursor-pointer';
  addBtn.innerHTML = '<span class="text-5xl font-light">+</span>';
  addBtn.addEventListener('click', () => openModal(null));
  speedDialContainer.appendChild(addBtn);
}

// 2. Генерація кнопок вибору кольору в модалці
function renderColorPicker() {
  if (!colorPickerContainer) return;
  
  colorPickerContainer.innerHTML = '';
  availableColors.forEach(color => {
    const btn = document.createElement('button');
    btn.className = `w-8 h-8 rounded-full ${color} border-2 border-transparent color-btn cursor-pointer transition-transform`;
    if (color === selectedColor) btn.classList.add('ring-2', 'ring-white', 'border-gray-900');
    
    btn.addEventListener('click', () => {
      selectedColor = color;
      renderColorPicker(); // Перемальовуємо, щоб оновити обведення
    });
    
    colorPickerContainer.appendChild(btn);
  });
}

// 3. Відкриття модального вікна
function openModal(index) {
  currentEditingIndex = index;
  renderColorPicker();

  if (index !== null) {
    // Режим редагування
    modalTitle.textContent = 'Редагувати закладку';
    linkTitleInput.value = savedLinks[index].title;
    linkUrlInput.value = savedLinks[index].url;
    linkIconInput.value = savedLinks[index].icon;
    selectedColor = savedLinks[index].bgColor;
    renderColorPicker(); // Оновлюємо виділений колір
  } else {
    // Режим додавання (очищаємо поля)
    modalTitle.textContent = 'Додати закладку';
    linkTitleInput.value = '';
    linkUrlInput.value = '';
    linkIconInput.value = '';
    selectedColor = availableColors[4];
  }

  modal.classList.remove('hidden');
}

// 4. Закриття
function closeModal() {
  if (modal) {
    modal.classList.add('hidden');
  }
}

// 5. Збереження
function saveLink() {
  const title = linkTitleInput.value.trim();
  const url = linkUrlInput.value.trim();
  const icon = linkIconInput.value.trim() || '🌐';

  if (!title || !url) {
    alert('Будь ласка, заповніть назву та URL!');
    return;
  }

  const newLink = { title, url, icon, bgColor: selectedColor };

  if (currentEditingIndex !== null) {
    savedLinks[currentEditingIndex] = newLink; // Оновлюємо існуючу
  } else {
    savedLinks.push(newLink); // Додаємо нову
  }

  localStorage.setItem('projectX_speedDial', JSON.stringify(savedLinks));
  closeModal();
  renderSpeedDial();
  
  console.log('[Speed Dial] Link saved:', newLink);
}

// 6. Видалення
function deleteLink(index) {
  if (confirm('Точно видалити цю закладку?')) {
    const deletedLink = savedLinks[index];
    savedLinks.splice(index, 1);
    localStorage.setItem('projectX_speedDial', JSON.stringify(savedLinks));
    renderSpeedDial();
    console.log('[Speed Dial] Link deleted:', deletedLink);
  }
}

// Функція для безпечного відображення HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Експорт функції ініціалізації
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initSpeedDial };
}

// Автоматична ініціалізація при завантаженні сторінки
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpeedDial);
} else {
  initSpeedDial();
}
