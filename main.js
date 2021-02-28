"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const SerialPort = require("serialport");
var mainWindow = null;
let isDebugMode = false;

/************************************************************
 * Window create 
 ***********************************************************/
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: { 
			// In Electron 12, the default will be changed to true.
			worldSafeExecuteJavaScript: true,
			// XSS対策としてnodeモジュールをレンダラープロセスで使えなくする
			nodeIntegration: false,
			// レンダとメインのglobal（window）を分離するか否か
			contextIsolation: true,  
			preload: path.resolve(__dirname + "/preload.js"),
		}
	});

	//mainWindow.webContents.loadURL("file://" + __dirname + "/index.html");
	mainWindow.loadFile("index.html");
	// Dev tool を自動起動
	//mainWindow.webContents.openDevTools();
	
	mainWindow.on('closed', function () {
		mainWindow = null;
	});
};

/************************************************************
 * app setting
 ***********************************************************/
app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on("ready", createWindow);


app.on('activate', function () {
	if (mainWindow === null) {
		createWindow();
	}
});

/************************************************************
 * IPC API
 ***********************************************************/
ipcMain.handle("scanComPort", async () => {
	SerialPort.list().then(
		(ports) => {
			mainWindow.webContents.send("resultScanComPort", ports);
		},
		(err) => {
			console.error(err);
		}
	);
});


ipcMain.handle("openComPort", async (event, comport) => {
	port = new SerialPort(comport, {
		//autoOpen: false,
		baudRate: 115200,
		dataBits: 8,
		stopBits: 1,
		parity: "none",
		flowControl: false,
	});

	port.on("open", () => {
		console.log("OpenEvent");
		mainWindow.webContents.send("resultOpenComPort", undefined);
		//port.on('data', console.log);

		let buf = Array();
		port.on('data', function (buffer) {
			//printArray(buffer);
			buf = buf.concat(decodeZigbeeFrame(buffer));

			console.debug("Received!");
			let [result, packet, nextbuf] = checkRecvBuffer(buf);
			if (result) {
				// 返信
				console.log("Start ==========");
				console.log(packet);
				console.log("END ==========");
				mainWindow.webContents.send("onReceiveData", packet);
				if (nextbuf === undefined) {
					buf = Array();
				}
				else{
					buf = nextbuf;
				}
			}
		});
	});

	port.on('error', function(err) {
		console.log('Error: ', err.message);
		mainWindow.webContents.send("resultOpenComPort", err.message);
	})
});

ipcMain.handle("closeComPort", async () => {
	port.close();
	port = null;
	console.log("CloseOK");
});


let port;
ipcMain.handle("requestTransmit", async (event, comport, tx_data) => {
	console.debug(comport);
	console.debug(tx_data);
	
	if (tx_data.length === 0) {
		mainWindow.webContents.send("transmitComplete");
	}
	
	if(port.isOpen){
		let ti = setInterval(async () => {
			//console.log("loop");
			if (tx_data) {
				let encode_result = encodeZigbeeData(tx_data);
				let arrays = segmentation(encode_result, 500);
				for(let i=0; i<arrays.length; i++) {
					port.write(arrays[i]);
					if (arrays.length > 1) {
						console.debug("Waiting...");
						await wait(1000);
					}
				}
				
				tx_data = null;
				clearInterval(ti);
				mainWindow.webContents.send("transmitComplete", encode_result);
			}
		}, 10);
	}
});

/************************************************************
 * Model (Logic)
 ***********************************************************/
let escape_flag = false;
function decodeZigbeeFrame(packet) {
	let data = Array();
	//let escape_flag = false;
	for (var i = 0; i < packet.length; i++) {
		if (packet[i] === 0x7D) {
			escape_flag = true;
			continue;
		}
		if (escape_flag === true) {
			data.push(packet[i] ^ 0x20);
			escape_flag = false;
			continue;
		}
		data.push(packet[i]);
	}
	return data;
}

function checkRecvBuffer(buffer) {
	if (buffer.length < 3) {
		return [false, buffer, undefined];
	}

	//printArray(buffer);
	const len = (buffer[1] << 8) + buffer[2] + 4; // start delimiter, length, length, chcksum
	if (isDebugMode) {
		console.table([{Expected_data_size: len, Received_data_size: buffer.length}]);
	}
	//console.log(len, buffer.length, Uint8Array.from(buffer).length);
	// TODO: Add check checksum code
	if (len === buffer.length) {
		return [true, buffer, undefined];
	}
	if (len < buffer.length) {
		let tmpbuf = Array();
		let nextbuf = Array();
		for (let i=0; i<buffer.length; i++) {
			if (i <= len) {
				tmpbuf.push(buffer[i]);
				continue;
			}
			nextbuf.push(buffer[i]);
		}
		return [true, tmpbuf, nextbuf];
	}
	return [false, buffer, undefined];
}

function encodeZigbeeData(array) {
	let data = Array();
	if (array.length > 0xFFFF) {
		return undefined;
	}
	if (typeof (array) === "string") {
		array = (new TextEncoder).encode(array);
	}

	data.push(0x7E);
	if (((array.length >> 8) & 0xFF) === 0x7E || ((array.length >> 8) & 0xFF) === 0x7D) {
		data.push(0x7D);
		data.push(((array.length >> 8) & 0xFF) ^ 0x20);
	}
	else {
		data.push((array.length >> 8) & 0xFF);
	}
	if ((array.length & 0xFF) === 0x7E || (array.length & 0xFF) === 0x7D) {
		data.push(0x7D);
		data.push((array.length & 0xFF) ^ 0x20);
	}
	else {
		data.push(array.length & 0xFF);
	}

	var checksum = 0x00;
	for (var i = 0; i < array.length; i++) {
		checksum += array[i];
		if (array[i] === 0x7E || array[i] === 0x7D) {
			data.push(0x7D);
			data.push(array[i] ^ 0x20);
			continue;
		}
		data.push(array[i]);
	}
	checksum = 0xFF - (checksum & 0xFF);
	if (checksum === 0x7E || checksum === 0x7D) {
		data.push(0x7D);
		data.push(checksum ^ 0x20);
	}
	else{
		data.push(checksum);
	}

	/*
	// for debug
	console.log(array.length);
	for (var i=0; i<data.length; i++) {
		process.stdout.write(("00" + data[i].toString(16).toUpperCase()).slice(-2));
		process.stdout.write(" ");
	}
	console.log("");
	*/
	return Uint8Array.from(data);
}

function segmentation(arrayBuffer, segmentSize)
{
    var segments= [];
    var fi = 0;
    while(fi*segmentSize< arrayBuffer.byteLength){
        segments.push( arrayBuffer.slice(fi*segmentSize, (fi+1)*segmentSize) );
        ++fi;
    }
    return segments;
}

function byteArray2JsonObject(data) {
	let str = "";
	for (var i = 3; i < data.length - 1; i++) {
		str += (new TextDecoder).decode(Uint8Array.of(data[i]));
	}
	
	const jsonObject = JSON.parse(str);
	return jsonObject;
}

function byteArray2JsonString(data) {
	let str = "";
	for (var i = 3; i < data.length - 1; i++) {
		str += (new TextDecoder).decode(Uint8Array.of(data[i]));
	}
	
	const jsonObject = JSON.parse(str);
	const json = JSON.stringify(jsonObject, null, 4);
	return json;
}

function printArray(data) {
	process.stdout.write("Raw: <");
	for (var i = 0; i < data.length; i++) {
		process.stdout.write("0x");
		process.stdout.write(data[i].toString(16));
		process.stdout.write(" ");
	}
	console.log(">");

	process.stdout.write("Str: <");
	for (var i = 0; i < data.length; i++) {
		process.stdout.write((new TextDecoder).decode(Uint8Array.of(data[i])));
	}
	console.log(">");
}

function arrayPrettyPrintJSON(data) {
	const json = byteArray2JsonString(data);
	console.log("/*======================================*/");
	console.log(json);
	console.log("/*======================================*/");
}

function wait(timeout) {
    return new Promise((resolve, reject) => setTimeout(resolve, timeout));
}

console.debug = function(args)
{
	if (isDebugMode){
		console.log(args);
	}
}