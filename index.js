const electron = require('electron');
const { join } = require('path');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const { writeFileSync, existsSync, mkdirSync, unlinkSync } = require('fs');
const { cpus } = require('os');
const fetch = require('node-fetch');

const { app, BrowserWindow, Menu, ipcMain } = electron;
const { info } = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('starting the app');

let currentWindow;
let cpuProc;
let gpuProc;
const platform = process.platform;
const gotTheLock = app.requestSingleInstanceLock();
const cpuCount = cpus().length;

const MenuTemplate = [
	{
		label: 'Debugging',
		submenu: [
			{
				label: 'Toggle Developer Tools',
				accelerator: (function() {
					if (process.platform === 'darwin')
						return 'Alt+Command+I';
					else
						return 'Ctrl+Shift+I';
				})(),
				click: function(item, focusedWindow) {
					if (focusedWindow)
					focusedWindow.toggleDevTools();
				}
			}
		]
	}
];

// If mac, add empty object to menu
if(process.platform == 'darwin') {
	mainMenuTemplate.unshift({});
}

if (!gotTheLock && app.isPackaged) {
	app.quit();
} else {
	app.on('second-instance', () => {
		if (currentWindow) {
			if (currentWindow.isMinimized()) currentWindow.restore();
			currentWindow.focus();
		}
	});

	app.on('ready', () => {
		currentWindow = new BrowserWindow({ 
			minWidth: 400, 
			minHeight: 400, 
			icon: join(__dirname, 'build/icon.png'), 
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false
			}
		});
		currentWindow.maximize();
		currentWindow.show();
		currentWindow.loadURL(`file://${join(__dirname, 'html/main.html')}`);
		currentWindow.on('closed', () => {
			if (cpuProc) cpuProc.kill();
			if (gpuProc) gpuProc.kill();
			log.info('stopped the app');
			if (process.platform !== 'darwin') {
				app.quit();
			}
		});
		const currentMenu = Menu.buildFromTemplate(MenuTemplate);
		Menu.setApplicationMenu(currentMenu);

		if(app.isPackaged) {
			log.info('starting update check');
			return autoUpdater.checkForUpdates();
		} else {
			return currentWindow.webContents.openDevTools();
		}
	});

	ipcMain.on('focus', () => {
		if (currentWindow.isMinimized()) currentWindow.restore();
		return currentWindow.focus();
	});

	ipcMain.on('getPath', (event, data) => {
		const userDataPath = electron.app.getPath(data);
		return currentWindow.webContents.send('getPath', userDataPath);
	});

	ipcMain.on('log', (event, data) => {
		return log.info(data);
	});

	ipcMain.on('resetXmrig', (event, { type }) => {
		if (cpuProc || gpuProc) return  currentWindow.webContents.send('resetXmrigStatus', { type, message: 'You can\'t reset the config while mining'});

		const userDataPath = electron.app.getPath('userData');

		const xmrigFolderPath = join(userDataPath, 'xmrig');
		if (!existsSync(xmrigFolderPath)) return currentWindow.webContents.send('resetXmrigStatus', { type, message: 'There is no existing config'});

		const configPath = join(userDataPath, `xmrig/${type}.json`);
		if (!existsSync(configPath)) return currentWindow.webContents.send('resetXmrigStatus', { type, message: 'There is no existing config' });

		unlinkSync(configPath);
		return currentWindow.webContents.send('resetXmrigStatus', { type, message: `Deleted the config` });
	});

	ipcMain.on('startMiner', async (event, { username, type, reload }) => {
		if(type == 'cpu' && !!cpuProc) {
			cpuProc.kill();
			cpuProc = null;

			if (!reload) return currentWindow.webContents.send('miner-status', { type, status: false });
		}
		if(type == 'gpu' && !!gpuProc) {
			gpuProc.kill();
			gpuProc = null;
			
			if (!reload) return currentWindow.webContents.send('miner-status', { type, status: false });
		}

		if (!['cpu','gpu'].includes(type)) return;

		const userDataPath = electron.app.getPath('userData');
		const templatePath = join(__dirname, `xmrig/${type}.json`);
		const configPath = join(userDataPath, `xmrig/${type}.json`);

		const xmrigFolderPath = join(userDataPath, 'xmrig');
		if (!existsSync(xmrigFolderPath)) mkdirSync(xmrigFolderPath);

		const config = existsSync(configPath) ? require(configPath) : require(templatePath);
		// if (type == 'cpu' && !isNaN(cpuUse)) {
		// 	config.cpu['max-threads-hint'] = Math.round((cpuUse / cpuCount) * 100);

		// 	for(const key in config.cpu) {
		// 		const value = config.cpu[key];
		// 		if(typeof value == 'object') {
		// 			config.cpu[key] = {
		// 				"threads": cpuUse
		// 			}
		// 		}
		// 	}
		// }

		config.pools[0].pass = `${username}-${type}`;
		await writeFileSync(configPath, JSON.stringify(config));

		if (!reload) log.info(`starting the ${type} miner`);
		else log.info(`updating the ${type} miner`);

		if (!['win32', 'darwin', 'linux'].includes(process.platform)) return log.error(`Unsupported platform (${process.platform})!`)

		const extra = process.platform == 'win32' ? '.exe' : '';
		const xmrigPath = join(app.getAppPath(), app.isPackaged ? '..' : '', `xmrig/${platform}/xmrig${extra}`);
		log.info(xmrigPath)

		const currentProc = spawn(xmrigPath, ['-c', configPath]);

		if(type == 'cpu') cpuProc = currentProc;
		if(type == 'gpu') gpuProc = currentProc;

		currentProc.stdout.on('data', (data) => {
			return log.info(data.toString())
		});
		currentProc.stderr.on('data', (data) => {
			return log.info(data.toString());
		});
		currentProc.on('error', (error) => {
			return log.error(error);
		})
		// currentProc.on('close', (code, signal) => {
		// 	currentWindow.webContents.send('miner-status', { type, status: false });
		// 	return log.info(`stopped the ${type} miner`);
		// });

		return currentWindow.webContents.send('miner-status', { type, status: true, reload });
	})

	// -------------------------------------------------------------------
	// Auto updates
	// -------------------------------------------------------------------
	autoUpdater.on('checking-for-update', () => {
	// if (currentWindow) currentWindow.webContents.send('alert', 'Checking for updates');
	});
	autoUpdater.on('update-available', (ev, info) => {
		if (currentWindow) currentWindow.webContents.send('alert', 'Automatically downloading an update!');
		if (info) log.info('update-available info', info);
	});
	autoUpdater.on('update-not-available', (ev, info) => {
	// if (currentWindow) currentWindow.webContents.send('alert', 'Update not available');
		if (info) log.info('update-not-available info', info);
	});
	autoUpdater.on('error', (ev, err) => {
		if (currentWindow) currentWindow.webContents.send('alert', 'Error in auto updater!');
		if (err) log.info('update-error error', err);
	});
	autoUpdater.on('update-downloaded', (ev, info) => {
		if (currentWindow) currentWindow.webContents.send('alert', 'Automatically restarting in 3 seconds for an update!');
		if (info) log.info('update-download info', info);
		setTimeout(() => {
			autoUpdater.quitAndInstall();
		}, 3000);
	});
}