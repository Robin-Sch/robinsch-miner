const electron = require('electron');
const { join } = require('path');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const { writeFileSync, existsSync, mkdirSync } = require('fs');

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
			autoUpdater.checkForUpdates();
		} else {
			currentWindow.webContents.openDevTools();
		}

	});


	// Menu options bar
	const MenuTemplate = [];

	ipcMain.on('focus', () => {
		if (currentWindow.isMinimized()) currentWindow.restore();
		currentWindow.focus();
	});

	ipcMain.on('getPath', (event, data) => {
		const userDataPath = electron.app.getPath(data);
		currentWindow.webContents.send('getPath', userDataPath);
	});

	ipcMain.on('log', (event, data) => {
		log.info(data);
	});

	ipcMain.on('startMiner', (event, { username, type }) => {
		if(type == 'cpu' && !!cpuProc) return cpuProc.kill();
		if(type == 'gpu' && !!gpuProc) return gpuProc.kill();

		if (!['cpu','gpu'].includes(type)) return;

		const userDataPath = electron.app.getPath('userData');
		const templatePath = join(__dirname, `xmrig/${type}.json`);
		const configPath = join(userDataPath, `xmrig/${type}.json`);

		const config = existsSync(configPath) ? require(configPath) : require(templatePath);
		config.pools[0].pass = username;

		if (!existsSync(join(userDataPath, 'xmrig'))) mkdirSync(join(userDataPath, 'xmrig'));
		writeFileSync(configPath, JSON.stringify(config));

		log.info(`starting the ${type} miner`)
		const currentProc = spawn(`./xmrig/${platform}/xmrig`, ['-c', configPath]);

		if(type == 'cpu') cpuProc = currentProc;
		if(type == 'gpu') gpuProc = currentProc;

		currentWindow.webContents.send('miner-status', { type, status: true });

		currentProc.stdout.on('data', function(data) {
			log.info(data.toString())
		});
		currentProc.stderr.on('data', function(data) {
			log.info(data.toString())
		});
		currentProc.on('error', function(error) {
			log.error(error);
		})
		currentProc.on('close', function(code, signal) {
			currentWindow.webContents.send('miner-status', { type, status: false });
			log.info(`stopped the ${type} miner`);
		});
	})

	// If mac, add empty object to menu
	if(process.platform == 'darwin') {
		mainMenuTemplate.unshift({});
	}

	// -------------------------------------------------------------------
	// Auto updates
	// -------------------------------------------------------------------
	autoUpdater.on('checking-for-update', () => {
	// if (currentWindow) currentWindow.webContents.send('alert', 'Checking for updates');
	});
	autoUpdater.on('update-available', (ev, info) => {
		if (currentWindow) currentWindow.webContents.send('alert', 'Download new update!');
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
		if (currentWindow) currentWindow.webContents.send('alert', 'Restarting in 3 seconds for update!');
		if (info) log.info('update-download info', info);
		setTimeout(() => {
			autoUpdater.quitAndInstall();
		}, 3000);
	});
}