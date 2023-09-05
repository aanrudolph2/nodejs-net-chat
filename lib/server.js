'use strict'

const dgram = require('dgram')
const EventEmitter = require('events')
const util = require('util')

function Server(options) {
  options = options || {}

  EventEmitter.call(this, options)

  this.server = dgram.createSocket('udp4')
  this.server.on('message', (msg, rinfo) => {
    try {
      let data = JSON.parse(msg.toString('utf8'))
      this.emit('message', data, rinfo)
    } catch(e) {
      this.emit('error', e.message)
    }
  })

  this.server.on('error', err => {
    this.emit('error', err);
  })

  this.server.on('listening', () => {
    this.emit('listening', this.server.address())
  })
}

Server.prototype.bind = function(port, cb, shouldBroadCast) {
  if(!port) port = 5123

  this.server.bind(port, () => {
    if(shouldBroadCast) this.server.setBroadcast(shouldBroadCast)
    cb && process.nextTick(cb)
  })
}

Server.prototype.close = function() {
  this.server.close()
  this.emit('close', this.server)
}

util.inherits(Server, EventEmitter)
module.exports = Server
