const electron = require('electron');
const { ipcRenderer } = electron;
const SaveData = require('../js/SaveData.js');
const savedata = new SaveData({
	configName: 'user-preferences',
});
const currentData = new SaveData({
	configName: 'current',
});

let mining = { cpu: false, gpu: false };

const userNameInput = document.getElementById('username');
const cpuMinerButton = document.getElementById('start-miner-cpu');
const log = document.getElementById('log');

const startMiner = (type, reload) => {
	cpuMinerButton.onclick = () => { startMiner('cpu', false) };
	const username = getUsername();
	if (!username || typeof username !== 'string') return logFunction('username', 'An invalid username is specified');

	let command = null;

	const enabled = document.getElementById(`custom-command-${type}-enabled`).checked;
	if (enabled) {
		command = document.getElementById(`custom-command-${type}-file`).value + " " + document.getElementById(`custom-command-${type}-flags`).value;
		if (!command) return logFunction(type, `An invalid command is specified (uncheck the box in ${type} advanced options)`);
	}

	savedata.set(`${type}-command`, command);
	savedata.set(`${type}-command-checked`, enabled);

	return ipcRenderer.send('startMiner', { username, type, reload, command });
}

ipcRenderer.on('miner-status', (event, { type, status, reload }) => {
	const button = document.getElementById(`start-miner-${type}`);

	mining[type] = status;

	if(status) {
		button.className = "btn btn-danger btn-block"
		button.innerHTML = `Stop the ${type} miner`;
		if(reload) {
			return logFunction(type, 'Updated the miner');
		} else {
			return logFunction(type, 'Started the miner');
		}
	} else {
		button.className = "btn btn-success btn-block"
		button.innerHTML = `Start the ${type} miner`;
		return logFunction(type, 'Stopped the miner');
	}
});

ipcRenderer.on('resetXmrigStatus', (event, { type, message }) => {
	closeModal(type);

	return logFunction(type, message);
});

ipcRenderer.on('pool-status', (event, { online }) => {
	if (!online) return logFunction('pool', 'Can\'t connect to the pool, please try again later');
});

ipcRenderer.on('log', (event, { type, message }) => {
	return logFunction(type, message);
});

ipcRenderer.on('miner-log', (event, { data, type }) => {
	const el = document.getElementById(`${type}-log`);
	return el.innerHTML = data + '\n' + el.innerHTML;
});

const getUsername = () => {
	const username = userNameInput.value;
	if (!username) return logFunction('username', 'An invalid username is specified');
	savedata.set('username', username);
	return username;
}

const resetConfig = (type) => {
	if (mining[type]) return alert('You can not reset the configuration while mining!');

	showLog(type, true);
	document.getElementById(`custom-command-${type}-enabled`).checked = false;
	document.getElementById(`custom-command-${type}-file`).value = null;
	document.getElementById(`custom-command-${type}-flags`).value = null;

	savedata.set(`${type}-command`, null);
	savedata.set(`${type}-command-checked`, false);

	return ipcRenderer.send('resetXmrig', { type });
}

const showLog = (type, show) => {
	const logEl = document.getElementById(`${type}-log`);
	const buttonEl = document.getElementById(`show-${type}-logs`);

	savedata.set(`show-${type}-log`, show);
	closeModal(type);


	if (show) {
		logEl.style = "display: block";
		buttonEl.innerHTML = `Hide ${type.toUpperCase()} logs`;
		return buttonEl.onclick = () => { showLog(type, !show) };
	} else {
		logEl.style = "display: none";
		buttonEl.innerHTML = `Show ${type.toUpperCase()} logs`;
		return buttonEl.onclick = () => { showLog(type, !show) };
	}
}

const logFunction = (type, message) => {
	return log.innerHTML = `<tr><th scope=\"row\">${type}</th><th>${message}</th></tr>` + log.innerHTML;
}

const loadSaved = () => {
	const oldUsername = savedata.get('username');
	if (oldUsername !== null) userNameInput.value = oldUsername;

	const oldCpuCommand = savedata.get('cpu-command');
	if (oldCpuCommand !== null && oldGpuCommand !== undefined) {
		const command = oldCpuCommand.split(' ');
		document.getElementById('custom-command-cpu-file').value = command[0];
		document.getElementById('custom-command-cpu-flags').value = command.slice(1).join(' ');
	}

	const oldCpuCommandChecked = savedata.get('cpu-command-checked');
	if (oldCpuCommandChecked !== null) document.getElementById('custom-command-cpu-enabled').checked = oldCpuCommandChecked;

	const oldCpuShowLog = savedata.get('show-cpu-log');
	if (oldCpuShowLog !== null) showLog('cpu', oldCpuShowLog);

	const oldGpuCommand = savedata.get('gpu-command');
	if (oldGpuCommand !== null && oldGpuCommand !== undefined) {
		const command = oldGpuCommand.split(' ');
		document.getElementById('custom-command-gpu-file').value = command[0];
		document.getElementById('custom-command-gpu-flags').value = command.slice(1).join(' ');
	}

	const oldGpuCommandChecked = savedata.get('gpu-command-checked');
	if (oldGpuCommandChecked !== null) document.getElementById('custom-command-gpu-enabled').checked = true;

	const oldGpuShowLog = savedata.get('show-gpu-log');
	if (oldCpuShowLog !== null) showLog('gpu', oldCpuShowLog);

	return logFunction('config', 'Configuration loaded');
}

const closeModal = (type) => {
	const myModalEl = document.getElementById(`advanced-${type}`);
	const modal = bootstrap.Modal.getInstance(myModalEl);

	if (!modal) return;
	return modal.hide();
}


setTimeout(() => {
	loadSaved();
}, 2000);