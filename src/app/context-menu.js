import { ipcMain, Menu, clipboard } from 'electron';
import * as tabManager from '../modules/tab-manager.js';

function registerContextMenu(getMainWindow) {
  ipcMain.on('show-context-menu', (event, params) => {
    const mainWindow = getMainWindow();
    const { tabId, selectionText, linkURL, linkText, srcURL, mediaType, isEditable, pageURL } = params;
    const template = [];

    if (selectionText) {
      const label = selectionText.length > 30 ? selectionText.substring(0, 30) + '…' : selectionText;
      if (isEditable) {
        template.push({ label: 'Вирізати', click: () => mainWindow.webContents.send('context-menu-action', { action: 'cut', tabId }) });
      }
      template.push({ label: 'Копіювати', click: () => mainWindow.webContents.send('context-menu-action', { action: 'copy', tabId }) });
      template.push({ type: 'separator' });
      template.push({
        label: `Знайти: "${label}"`,
        click: () => mainWindow.webContents.send('context-menu-action', { action: 'search', tabId, text: selectionText })
      });
      template.push({
        label: `Перекласти: "${label}"`,
        click: () => mainWindow.webContents.send('context-menu-action', { action: 'translate', tabId, text: selectionText })
      });
    }

    if (isEditable) {
      template.push({ label: 'Вставити', click: () => mainWindow.webContents.send('context-menu-action', { action: 'paste', tabId }) });
      template.push({ label: 'Виділити все', click: () => mainWindow.webContents.send('context-menu-action', { action: 'select-all', tabId }) });
    }

    if (linkURL) {
      if (template.length > 0) template.push({ type: 'separator' });
      template.push({
        label: 'Відкрити посилання в новій вкладці',
        click: () => mainWindow.webContents.send('context-menu-action', { action: 'open-link-new-tab', tabId, url: linkURL })
      });
      template.push({ label: 'Копіювати адресу посилання', click: () => clipboard.writeText(linkURL) });
      if (linkText) {
        template.push({ label: 'Копіювати текст посилання', click: () => clipboard.writeText(linkText) });
      }
    }

    if (mediaType === 'image' && srcURL) {
      if (template.length > 0) template.push({ type: 'separator' });
      template.push({
        label: 'Відкрити зображення в новій вкладці',
        click: () => mainWindow.webContents.send('context-menu-action', { action: 'open-link-new-tab', tabId, url: srcURL })
      });
      template.push({ label: 'Копіювати адресу зображення', click: () => clipboard.writeText(srcURL) });
      template.push({
        label: 'Зберегти зображення як…',
        click: () => mainWindow.webContents.send('context-menu-action', { action: 'save-image', tabId, url: srcURL })
      });
    }

    if (template.length > 0) template.push({ type: 'separator' });
    template.push({ label: 'Назад',    click: () => tabManager.goBack()    });
    template.push({ label: 'Вперед',  click: () => tabManager.goForward()  });
    template.push({ label: 'Оновити', click: () => tabManager.reload()     });
    template.push({ type: 'separator' });
    template.push({ label: 'Копіювати адресу сторінки', click: () => clipboard.writeText(pageURL) });
    template.push({
      label: 'Переглянути вихідний код',
      click: () => mainWindow.webContents.send('context-menu-action', { action: 'view-source', tabId, url: pageURL })
    });
    template.push({
      label: 'Інструменти розробника',
      click: () => mainWindow.webContents.send('toggle-webview-devtools')
    });

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

export { registerContextMenu };
