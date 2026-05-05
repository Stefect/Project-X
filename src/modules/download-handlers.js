import { session } from 'electron';

let downloadIdCounter = 0;

function registerDownloadHandlers(getMainWindow) {
  const handleSession = (ses) => {
    ses.on('will-download', (event, item) => {
      const id = ++downloadIdCounter;
      const filename = item.getFilename();
      const totalBytes = item.getTotalBytes();

      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('download-started', { id, filename, totalBytes });
      }

      item.on('updated', (e, state) => {
        const w = getMainWindow();
        if (state === 'progressing' && w && !w.isDestroyed()) {
          w.webContents.send('download-progress', {
            id,
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes()
          });
        }
      });

      item.once('done', (e, state) => {
        const w = getMainWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send('download-done', { id, state });
        }
        console.log(`[DOWNLOAD] ${filename}: ${state}`);
      });
    });
  };

  handleSession(session.defaultSession);
  handleSession(session.fromPartition('persist:main'));
  console.log('[IPC] Download handlers registered');
}

export { registerDownloadHandlers };
