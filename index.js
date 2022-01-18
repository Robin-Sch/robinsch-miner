const electron = require('electron');
const { join } = require('path');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const { writeFileSync, existsSync, mkdirSync, unlinkSync, lstatSync } = require('fs');
const { cpus } = require('os');
const fetch = require('node-fetch');

const { app, BrowserWindow, Menu, ipcMain } = electron;

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
		label: 'Updates',
		submenu: [
			{
				label: `Version: ${app.getVersion()}`
			},
			{
				label: 'Check for updates',
				click: function(item, focusedWindow) {
					autoUpdater.checkForUpdates();
				}
			}
		]
	},
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
			autoUpdater.checkForUpdates();
		} else {
			currentWindow.webContents.openDevTools();
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

	ipcMain.on('startMiner', async (event, { username, type, reload, command }) => {
		try {
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

			if(!(await checkPool())) return;

			if (!['cpu','gpu'].includes(type)) return log.info(`No CPU or GPU as mining type! ${type}`);

			const resourcesPath = join(app.getAppPath(), app.isPackaged ? '..' : '');
			const userDataPath = electron.app.getPath('userData');

			log.info(`resourcesPath: ${resourcesPath}`);
			log.info(`userDataPath: ${userDataPath}`);

			const curLog = log;
			log.transports.file.resolvePath = () => join(userDataPath, `logs/${type}.log`);

			const minerUsername = `${username}-${type}`;
			curLog.info(`Mining username: ${minerUsername}`);

			if (!reload) curLog.info(`starting the ${type} miner`);
			else curLog.info(`updating the ${type} miner`);

			if (!!command) {
				command = command.split(' ');
				let filename = command[0];

				if (!existsSync(filename) || !lstatSync(filename).isFile()) {
					const resourcesPathFile = join(resourcesPath, filename);
					const userDataPathFile = join(userDataPath, filename);

					if (existsSync(resourcesPathFile) && lstatSync(resourcesPathFile).isFile()) filename = resourcesPathFile;
					else if (existsSync(userDataPathFile) && lstatSync(userDataPathFile).isFile()) filename = userDataPathFile;
					else {
						return currentWindow.webContents.send('log', { type, message: `An invalid file is specified (uncheck the box in ${type} advanced options)` })
					}
				}

				command[0] = filename;
			} else {
				if (!['win32', 'darwin', 'linux'].includes(process.platform)) return curLog.error(`Unsupported platform (${process.platform})!`);

				const templatePath = join(resourcesPath, `xmrig/${type}.json`);
				const configPath = join(userDataPath, `xmrig/${type}.json`);

				log.info(`templatePath: ${templatePath}`);
				log.info(`configPath: ${configPath}`);

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

				config.pools[0].pass = minerUsername;
				await writeFileSync(configPath, JSON.stringify(config));

				const extra = process.platform == 'win32' ? '.exe' : '';
				const xmrigPath = join(resourcesPath, `xmrig/${platform}/xmrig${extra}`);

				command = [xmrigPath, '-c', configPath];
			}

			const currentProc = spawn(command[0], command.slice(1));

			if(type == 'cpu') cpuProc = currentProc;
			if(type == 'gpu') gpuProc = currentProc;

			currentProc.stdout.on('data', (data) => {
				return curLog.info(data.toString())
			});
			currentProc.stderr.on('data', (data) => {
				return curLog.info(data.toString());
			});
			currentProc.on('error', (error) => {
				return curLog.error(error);
			})
			// currentProc.on('close', (code, signal) => {
			// 	currentWindow.webContents.send('miner-status', { type, status: false });
			// 	return curLog.info(`stopped the ${type} miner`);
			// });

			return currentWindow.webContents.send('miner-status', { type, status: true, reload });
		} catch (e) {
			log.error(`Problem in configuration file: ${e}`);
		}
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

const checkPool = async () => {
	try {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		const res = await fetch('https://gulf.moneroocean.stream');
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = undefined;
		const text = await res.text();
		if (text !== 'Mining Pool Online') {
			currentWindow.webContents.send('pool-status', { online: false });
			return false;
		} else {
			return true;
		}
	} catch (e) {
		currentWindow.webContents.send('pool-status', { online: false });
		return false;
	}
}