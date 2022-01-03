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
let mining = false;

const userNameInput = document.getElementById('username');
const cpuMinerButton = document.getElementById('start-miner-cpu');
const cpuUseSlider = document.getElementById('cpuUse');
const cpuUseSliderLabel = document.getElementById('cpuUseRangeLabel');

cpuUseSlider.onchange = () => {
	if (mining) {
		cpuMinerButton.onclick = () => { startMiner('cpu', true) };
		cpuMinerButton.innerHTML = `Update the cpu miner`;
	}
}

const getPrevious = setInterval(() => {
	if (!oldUsername) {
		oldUsername = savedata.get('username');
		if (oldUsername) {
			userNameInput.value = oldUsername;
			ipcRenderer.send('getStats', { username: `${oldUsername}-cpu` });
			ipcRenderer.send('getStats', { username: `${oldUsername}-gpu` });
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

	const json = { username, type, reload }
	if (type == 'cpu') json.cpuUse = cpuUseSlider.value;

	return ipcRenderer.send('startMiner', json);
}

ipcRenderer.on('miner-status', (event, { type, status, reload }) => {
	const button = document.getElementById(`start-miner-${type}`);
	const log = document.getElementById(`log-${type}`);

	mining = status;

	if(status) {
		button.innerHTML = `Stop the ${type} miner`;
		if(reload) {
			return log.innerHTML += "Updated the miner!<br>";
		} else {
			return log.innerHTML += "Started the miner!<br>";
		}
	} else {
		button.innerHTML = `Start the ${type} miner`;
		return log.innerHTML += "Stopped the miner!<br>";
	}
});

ipcRenderer.on('stats', (event, stats) => {
	const type = stats.identifer.split('-').pop();
	return document.getElementById(`stats-${type}`).innerHTML = `Total shares: ${stats.validShares}`;
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
setThreads(window.navigator.hardwareConcurrency / 2);