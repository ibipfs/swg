'use strict'

const IPFS = require('ipfs')

const defaults = {
      init: true,
      start: true,
      EXPERIMENTAL: {},
      preload: {
        enabled: false,
        addresses: [
          '/dnsaddr/node0.preload.ipfs.io/https',
          '/dnsaddr/node1.preload.ipfs.io/https'
        ]
      }
}

let node

/* start a IPFS node within the service worker */
const startNode = (configs) => {
  return new Promise((resolve) => {
    //node = new IPFS()
    node = new IPFS(configs || defaults)
    node.on('error', (error) => {
      console.log(error.toString())
    })

    node.on('ready', () => {
      resolve(node)
    })
  })
}

/* get a ready to use IPFS node */
const getNode = (configs) => {
  return new Promise((resolve) => {
    if (!node) {
      return startNode(configs || defaults).then((node) => resolve(node))
    }

    resolve(node)
  })
}

module.exports = {
  get: getNode,
  start: startNode
}
