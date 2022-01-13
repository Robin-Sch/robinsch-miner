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
let oldThreads = undefined;
let mining = { cpu: false, gpu: false };

const userNameInput = document.getElementById('username');
const cpuMinerButton = document.getElementById('start-miner-cpu');
const cpuUseSlider = document.getElementById('cpuUse');
const cpuUseSliderLabel = document.getElementById('cpuUseRangeLabel');
const log = document.getElementById('log');

cpuUseSlider.onchange = () => {
	if (mining.cpu) {
		cpuMinerButton.onclick = () => { startMiner('cpu', true) };
		cpuMinerButton.className = "btn btn-warning btn-block";
		cpuMinerButton.innerHTML = `Update the cpu miner`;
	}
}

const getPrevious = setInterval(() => {
	if (!oldUsername) {
		oldUsername = savedata.get('username');
		if (oldUsername) {
			userNameInput.value = oldUsername;
		}
	}

	if (!oldThreads) {
		oldThreads = savedata.get('threads');
		if (oldThreads) {
			setThreads(oldThreads);
		}
	}

	if (!!oldUsername && !!oldThreads) {
		return clearInterval(getPrevious);
	}
}, 500);

const startMiner = (type, reload) => {
	cpuMinerButton.onclick = () => { startMiner('cpu', false) };
	const username = getUsername();
	if (!username || typeof username !== 'string') return;

	const json = { username, type, reload }
	if (type == 'cpu') json.cpuUse = cpuUseSlider.value;

	return ipcRenderer.send('startMiner', json);
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

const getUsername = () => {
	const username = userNameInput.value;
	if (!username) return alert('You need to pick a username!');
	savedata.set('username', username);
	return username;
}

const setThreads = (threads) => {
	cpuUseSlider.value = threads
	return cpuUseSliderLabel.innerHTML = `Max amount of threads: ${threads}`;
}

cpuUseSlider.max = window.navigator.hardwareConcurrency;
setThreads(window.navigator.hardwareConcurrency);