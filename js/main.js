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

	if (!!oldUsername) {
		return clearInterval(getPrevious);
	}
}, 500);

const startMiner = (type, reload) => {
	cpuMinerButton.onclick = () => { startMiner('cpu', false) };
	const username = getUsername();
	if (!username || typeof username !== 'string') return log.innerHTML += `<tr><th scope=\"row\">username</th><th>An invalid username is specified/th></tr>`;

	return ipcRenderer.send('startMiner', { username, type, reload });
}

ipcRenderer.on('miner-status', (event, { type, status, reload }) => {
	const button = document.getElementById(`start-miner-${type}`);

	mining[type] = status;

	if(status) {
		button.className = "btn btn-danger btn-block"
		button.innerHTML = `Stop the ${type} miner`;
		if(reload) {
			return log.innerHTML += `<tr><th scope=\"row\">${type}</th><th>Updated the miner</th></tr>`;
		} else {
			return log.innerHTML += `<tr><th scope=\"row\">${type}</th><th>Started the miner</th></tr>`
		}
	} else {
		button.className = "btn btn-success btn-block"
		button.innerHTML = `Start the ${type} miner`;
		return log.innerHTML += `<tr><th scope=\"row\">${type}</th><th>Stopped the miner</th></tr>`
	}
});

ipcRenderer.on('resetXmrigStatus', (event, { type, message }) => {
	const myModalEl = document.getElementById(`advanced${type}`);
	const modal = bootstrap.Modal.getInstance(myModalEl);
	modal.hide();

	return log.innerHTML += `<tr><th scope=\"row\">${type}</th><th>${message}</th></tr>`
})

const getUsername = () => {
	const username = userNameInput.value;
	if (!username) return log.innerHTML += `<tr><th scope=\"row\">username</th><th>An invalid username is specified/th></tr>`;
	savedata.set('username', username);
	return username;
}

const resetXmrig = (type) => {
	if (mining[type]) return alert('You can not reset the configuration while mining!');

	return ipcRenderer.send('resetXmrig', { type });
}