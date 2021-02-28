"use strict";

const {contextBridge, ipcRenderer} = require("electron");

contextBridge.exposeInMainWorld(
	"api", {
		requestComPortList: () => ipcRenderer.invoke("scanComPort")
			.then()
			.catch((err) => {
				console.log(err)
			}),
		resultComPortList: (listener) => {
			ipcRenderer.once("resultScanComPort", (event, arg) => listener(arg));
		},
		requestOpenComPort: (comport) => ipcRenderer.invoke("openComPort", comport)
			.then()
			.catch((err) => {
				console.log(err)
			}),
		resultOpenComPort: (listener) => {
			ipcRenderer.once("resultOpenComPort", (event, arg) => listener(arg));
		},
		requestCloseComPort: () => ipcRenderer.invoke("closeComPort")
			.then()
			.catch((err) => {
				console.log(err)
			}),
		requestTransmit: (comport, txdata) => ipcRenderer.invoke("requestTransmit", comport, txdata)
			.then()
			.catch((err) => {
				console.log(err)
			}),
		transmitComplete: (listener) => {
			ipcRenderer.once("transmitComplete", (event, arg) => listener(arg));
		},
		onReceiveData: (listener) => {
			ipcRenderer.removeAllListeners("onReceiveData");
			ipcRenderer.on("onReceiveData", (event, arg) => listener(arg));
		},
	}
);
