"use strict";

var app = new Vue({
	el: '#app',
	data: {
		comports: [],
		tx_data: "",
		tx_log_data: "",
		rx_log_data: "",
		selectedIndex: 0,
		isOpenComPort: false,
		canTransmit: false
	},
	methods: {
		updateSelectedIndex: function(event) {
			this.selectedIndex = event.target.selectedIndex;
		},
		updateTxLog: function(log) {
			let txlog = document.getElementById("txlogarea");
			this.tx_log_data += log + "\n";
			this.tx_log_data += "===================\n"

			/* 最大履歴の管理 */
			const maxLength = 10000;
			if (this.tx_log_data.length > maxLength){
				var len = this.tx_log_data.length - maxLength;
				var tmp = this.tx_log_data;
				this.tx_log_data = tmp.slice(len);
			}

			txlog.scrollTop = txlog.scrollHeight;
		},
		clearTxLog: function() {
			this.tx_log_data = "";
		},
		updateRxLog: function(log) {
			let rxlog = document.getElementById("rxlogarea");
			this.rx_log_data += log + "\n";
			this.rx_log_data += "===================\n"

			/* 最大履歴の管理 */
			const maxLength = 10000;
			if (this.rx_log_data.length > maxLength){
				var len = this.rx_log_data.length - maxLength;
				var tmp = this.rx_log_data;
				this.rx_log_data = tmp.slice(len);
			}
			rxlog.scrollTop = rxlog.scrollHeight;
		},
		clearRxLog: function() {
			this.rx_log_data = "";
		},
		openComPort: function() {
			let comport = this.comports[this.selectedIndex].path;
			window.api.requestOpenComPort(comport);
			window.api.resultOpenComPort((res)=>{
				if (res === undefined) {
					this.isOpenComPort = true;
					this.canTransmit = true;
					window.api.onReceiveData((data)=>{
						let res = Array.from(data).map((x) => {return "0x"+("00" + x.toString(16).toUpperCase()).slice(-2)+" "});
						//this.updateRxLog(res);
						let tmp = Array.from(data.slice(3, -1)).map(x => (new TextDecoder).decode(Uint8Array.of(x)))
						this.updateRxLog(tmp.join(""));
					});
				}
				else{
					this.updateTxLog(res);
				}
			});
		},
		closeComPort: function() {
			this.isOpenComPort = false;
			this.canTransmit = false;
			window.api.requestCloseComPort();
		},
		refleshComPort:function() {
			this.comports = [];

			window.api.requestComPortList();
			window.api.resultComPortList((com_ports) => {
				// ()=> と function() の違いを調査
				for (let i=0; i<com_ports.length; i++) {
					this.comports.push({path: com_ports[i].path, name:com_ports[i].manufacturer});
				}
				this.selected = this.comports[0].path + " : " + this.comports[0].path
			});
		},
		requestTransmit: function() {
			let comport = this.comports[this.selectedIndex].path;
			this.canTransmit = false;
			window.api.requestTransmit(comport, this.tx_data);
			window.api.transmitComplete((data) => {
				this.canTransmit = true;
				if (data !== undefined) {
					let res = Array.from(data).map((x) => {return "0x"+("00" + x.toString(16).toUpperCase()).slice(-2)+" "});
					this.updateTxLog(res);
				}
			});
		},
		onTabKey: function(event) {
			if (event.keyCode != 9) {
				return;
			}
			event.preventDefault();
			let obj = event.target;
			let cursorPosition = obj.selectionStart;
			let cursorLeft     = obj.value.substr( 0, cursorPosition );
			let cursorRight    = obj.value.substr( cursorPosition, obj.value.length );
			obj.value = cursorLeft+"\t"+cursorRight;
			obj.selectionEnd = cursorPosition+1;
		}
	},
	mounted: function() {
		this.refleshComPort();
	},
	beforeDestroy: function() {
		if(this.isOpenComPort){
			window.api.requestCloseComPort();
		}
	}
});
