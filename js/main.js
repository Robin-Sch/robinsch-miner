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

const getPrevious = setInterval(() => {
	if (!oldUsername) {
		oldUsername = savedata.get('username');
		if (oldUsername) document.getElementById('username').value = oldUsername;
	} else {
		clearInterval(getPrevious);
	}
}, 500);

const startMiner = (type) => {
	const username = document.getElementById('username').value;
	if (!username) return alert('You need to pick a username!');
	savedata.set('username', username);
	ipcRenderer.send('startMiner', { username, type });
}

ipcRenderer.on('miner-status', (event, { type, status }) => {
	const button = document.getElementById(`start-miner-${type}`);
	const log = document.getElementById(`log-${type}`);
	if(status) {
		button.innerHTML = `Stop the ${type} miner`;
		log.innerHTML += "Started the miner!<br>";
	} else {
		button.innerHTML = `Start the ${type} miner`;
		log.innerHTML += "Stopped the miner!<br>";
	}
})