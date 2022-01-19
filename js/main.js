const electron = require('electron');
const { ipcRenderer } = electron;
const SaveData = require('../js/SaveData.js');
const savedata = new SaveData({
	configName: 'user-preferences',
});
const currentData = new SaveData({
	configName: 'current',
});

let oldUsername = undefined;
let oldCpuCommand = undefined;
let oldCpuCommandChecked = undefined;
let oldGpuCommand = undefined;
let oldGpuCommandChecked = undefined;
let mining = { cpu: false, gpu: false };

const userNameInput = document.getElementById('username');
const cpuMinerButton = document.getElementById('start-miner-cpu');
const log = document.getElementById('log');

const getPrevious = setInterval(() => {
	if (!oldUsername) {
		oldUsername = savedata.get('username');
		if (oldUsername) {
			userNameInput.value = oldUsername;
		}
	}

	if (!oldCpuCommand) {
		oldCpuCommand = savedata.get('cpu-command');
		if (oldCpuCommand) {
			command = oldCpuCommand.split(' ');
			document.getElementById('custom-command-cpu-file').value = command[0];
			document.getElementById('custom-command-cpu-flags').value = command.slice(1).join(' ');
		}
	}

	if (!oldCpuCommandChecked) {
		oldCpuCommandChecked = savedata.get('cpu-command-checked');
		if (oldCpuCommandChecked) {
			document.getElementById('custom-command-cpu-enabled').checked = true;
		}
	}

	if (!oldGpuCommand) {
		oldGpuCommand = savedata.get('gpu-command');
		if (oldGpuCommand) {
			command = oldGpuCommand.split(' ');
			document.getElementById('custom-command-gpu-file').value = command[0];
			document.getElementById('custom-command-gpu-flags').value = command.slice(1).join(' ');
		}
	}

	if (!oldGpuCommandChecked) {
		oldGpuCommandChecked = savedata.get('gpu-command-checked');
		if (oldGpuCommandChecked) {
			document.getElementById('custom-command-gpu-enabled').checked = true;
		}
	}
	
	if (!!oldUsername && !!oldCpuCommand && !!oldGpuCommand) {
		return clearInterval(getPrevious);
	}
}, 500);

const startMiner = (type, reload) => {
	cpuMinerButton.onclick = () => { startMiner('cpu', false) };
	const username = getUsername();
	if (!username || typeof username !== 'string') return logFunction('username', 'An invalid username is specified');

	let command = false;

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
	const myModalEl = document.getElementById(`advanced${type}`);
	const modal = bootstrap.Modal.getInstance(myModalEl);
	modal.hide();

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

const resetXmrig = (type) => {
	if (mining[type]) return alert('You can not reset the configuration while mining!');

	return ipcRenderer.send('resetXmrig', { type });
}

const logFunction = (type, message) => {
	return log.innerHTML = `<tr><th scope=\"row\">${type}</th><th>${message}</th></tr>` + log.innerHTML;
}