/* eslint-disable no-undef */
(() => {
	const electron = require('electron');
	const ipcRenderer = electron.ipcRenderer;
	const log = document.getElementById('log');
	ipcRenderer.on('alert', (event, data) => {
		log.innerHTML += `<tr class="table-info"><th scope=\"row\">update</th><th>${date}</th></tr>`;
	});
})();