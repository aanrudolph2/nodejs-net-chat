const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    userServer: (...args) => {
        return ipcRenderer.invoke('userServer', ...args)
    },
    broadCastServer: (...args) => {
        return ipcRenderer.invoke('broadCastServer', ...args)
    },
    updateNick: (...args) => {
        return ipcRenderer.invoke('updateNick', ...args)
    },
    setUp: (...args) => {
        return ipcRenderer.invoke('setUp', ...args)
    },
    initiateExchange: (...args) => {
        return ipcRenderer.invoke('initiateExchange', ...args)
    },
    sendMessage: (...args) => {
        return ipcRenderer.invoke('sendMessage', ...args)
    },
    getUser: (...args) => {
        return ipcRenderer.invoke('getUser', ...args)
    },
    jsesc: (...args) => {
        return ipcRenderer.invoke('jsesc', ...args)
    },
    ips : (...args) => {
        return ipcRenderer.invoke('ips');
    },
    updateNicks: (callback) => ipcRenderer.on('update-nicks', callback),
    updateMessages: (callback) => ipcRenderer.on('update-messages', callback)
});