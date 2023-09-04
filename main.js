'use strict'

const net = require('net')
const dgram = require('dgram');
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path');
const createStore = require('./store').createStore
const Utils = require('./utils')
const DeffMan = require('./lib/dfh')
const DHT = require('./lib/dht')
const Server = require('./lib/server')
const vault = require('./lib/vault');
const jsesc = require('jsesc');
const appConfig = require('./package.json').appConfig
const PORT = Utils.normalizePort(appConfig.appPort)
const clientPort  = Utils.normalizePort(appConfig.broadcastClientPort)
const serverPort  = Utils.normalizePort(appConfig.broadcastServerPort)
const broadCastIp = appConfig.broadcastIp

let nicks = createStore('nick')
let mainWindow = null, server, bServer, nick, blurred = false

function getUser(event, name) {
    let server, broadCastServer, nick;

    return Utils.getUserName(name).then((data) => JSON.parse(data)).catch(e => console.log(e))
}

function echoPresence(message) {
    return new Promise((res) => {
        let broadCastClient = dgram.createSocket('udp4')
        message = new Buffer(JSON.stringify(message))

        broadCastClient.bind(clientPort, () => {
            console.log('broadcast client running on PORT ', clientPort)

            broadCastClient.setBroadcast(true)
            broadCastClient.send(message, 0, message.length, serverPort, broadCastIp, () => {
                broadCastClient.close(() => { console.log('client shutdown') })
                res()
            })
        })
    })
}

function createWindow() {
    mainWindow = new BrowserWindow({
        height: 600,
        width: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })

    mainWindow.loadFile('app/views/index.html')
    mainWindow.webContents.openDevTools()
    mainWindow.on('close', () => {
        mainWindow = null
    })

    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('stuff')
    })

    mainWindow.on('blur', () => {
        blurred = true
    })

    mainWindow.on('focus', () => {
        blurred = false
    })

    ipcMain.handle('userServer', userServer);
    ipcMain.handle('broadCastServer', broadCastServer);
    ipcMain.handle('updateNick', updateNick);
    ipcMain.handle('setUp', setUp);
    ipcMain.handle('initiateExchange', initiateExchange);
    ipcMain.handle('sendMessage', sendMessage);
    ipcMain.handle('getUser', getUser);
    ipcMain.handle('jsesc', (...args) => jsesc(...args.slice(1)));
}
app.on('ready', createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
    if (server) server.close()
    if (bServer) bServer.close()
})

function parseUserMessage(msg, rinfo) {
    try {
        msg = JSON.parse(msg)

        if (msg.type == 'clients') {
            let clients = JSON.parse(msg.data)

            clients.forEach(c => DHT.create(Buffer.from(c.id), c.ip, c.port, c.nick))
            nicks.reduce(n => {
                clients.forEach(c => n[c.nick] = { ip: c.ip })
                return n
            })

            mainWindow.webContents.send('update-nicks', nicks.get())
        } else if (msg.type == 'message') {
            const from = nicks.get(msg.from)
            const to = nicks.get(nick)

            let decryptedMsg = vault.decrypt(msg.text, to.dfh.computeSecret(from.publicKey).toString('hex'))

            mainWindow.webContents.send('update-messages', { from: msg.from, text: JSON.stringify(decryptedMsg), blurred: blurred })
        } else if (msg.type == 'keyxchange_alice') {
            const bob = new DeffMan(Buffer.from(msg.prime), Buffer.from(msg.generator))
            const bob_key = bob.getPublicKey()

            nicks.update(msg.from, { publicKey: Buffer.from(msg.key) })
            nicks.update(nick, { dfh: bob })
            sendClientMessage(JSON.stringify({ type: 'keyxchange_bob', key: bob_key, to: nick }), rinfo.address)
        } else if (msg.type == 'keyxchange_bob') {
            nicks.update(msg.to, { publicKey: Buffer.from(msg.key) })
        }
    } catch (e) {
        console.log(e)
        mainWindow.webContents.send('error', { message: e.message })
    }
}

function sendClientMessage(message, address, cb) {
    let buff = Buffer.alloc(4)
    let hex = message.length.toString(16)

    let client = net.connect({ port: PORT, host: address }, () => {
        if (hex.length % 2 !== 0) hex = '0' + hex
        buff.writeUIntBE(`0x${hex}`, 0, 4)

        client.write(buff)
        client.write(Buffer.from(message, 'utf8'))
    })
}

function parseBroadcastMessage(msg, rinfo, nick) {
    //console.log('parseBroadcastMessage', msg)
    try {
        if (msg.type == 'nick') {
            nicks.reduce(n => {
                n[msg.nick] = { ip: rinfo.address }
                return n
            })

            DHT.create(Utils.encrypt(rinfo.address), rinfo.address, PORT, msg.nick)
            mainWindow.webContents.send('update-nicks', nicks.get())

            const message = JSON.stringify({ type: 'clients', data: DHT.serialize() })
            sendClientMessage(message, rinfo.address)
        } else if (msg.type == 'leave') {
            nicks.reduce(n => {
                delete n[msg.nick]
                return n
            })

            mainWindow.webContents.send('update-nicks', nicks.get())
        } else if (msg.type == 'update_nick') {
            nicks.reduce(n => {
                let t = Object.assign({}, n[msg.from])
                n[msg.newNick] = t
                n[msg.from] = null
                delete n[msg.from]
                return n
            })

            mainWindow.webContents.send('update-nicks', nicks.get())
        }
    } catch (e) {
        console.log(e)
        mainWindow.webContents.send('error', e.message)
    }
}

let broadCastServer = function (event, name) {
    nick = name

    if (bServer) return Promise.resolve(bServer)

    return new Promise(res => {
        bServer = new Server()

        bServer.on('message', (msg, rinfo) => parseBroadcastMessage(msg, rinfo, nick))

        bServer.on('close', () => {
            echoPresence({ nick: nick, type: 'leave' })
        })

        bServer.bind(serverPort, () => {
            console.log('broadcast server listening on PORT ', serverPort)
            res()
        })
    })
}


let setUp = function (event) {
    return echoPresence({ nick: nick, type: 'nick' }).catch(e => console.log(e))
}

let userServer = function (event) {
    if (server) return Promise.resolve(server)

    return new Promise(res => {
        let len;
        let buff = Buffer.from('');
        let address;

        server = net.createServer(sock => {
            sock.on('data', (data) => {
                address = sock.remoteAddress == '::ffff:127.0.0.1' ? Utils.ips()[0] : sock.remoteAddress

                buff = Buffer.concat([buff, data])

                if (!len) {
                    len = buff.readUIntBE(0, 4)
                    buff = buff.slice(4)
                }

                if (buff.length >= len) {
                    parseUserMessage(buff.slice(0, len), { address: address })
                    buff = Buffer.from(buff.slice(len, buff.length))
                    len = 0
                }
            })
        }).listen(PORT, () => {
            console.log('user server listening on PORT ', PORT)
            res()
        })
    })
}

let initiateExchange = function (event, from, to, cb) {
    let alice = new DeffMan

    const fromIp = nicks.get(from)
    const toIp = nicks.get(to)
    const key = alice.getPublicKey()
    const message = JSON.stringify({ type: 'keyxchange_alice', from: from, to: to, prime: alice.sharedPrime, generator: alice.generator, key: key })

    nicks.update(from, { dfh: alice })

    if (toIp && net.isIP(toIp.ip)) sendClientMessage(message, toIp.ip, cb)
}

let updateNick = function (event, nick, newNick) {
    let fromIp = nicks.get(nick)

    if (fromIp) {
        index.echoPresence({ type: 'update_nick', from: nick, newNick: newNick })
    }
}

let sendMessage = function (event, from_name, to_name, value) {
    if (nicks) {
        const to = nicks.get(to_name)
        const from = nicks.get(from_name)

        if (to && from && net.isIP(to.ip), net.isIP(from.ip)) {
            let text = vault.encrypt(value, from.dfh.computeSecret(to.publicKey).toString('hex'))
            let message = JSON.stringify({ type: 'message', from: from_name, text: JSON.stringify(text) })
            sendClientMessage(message, to.ip)
        }
    }
}
