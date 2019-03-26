'use strict'

const IPFS = require('ipfs')

let node

/* start a IPFS node within the service worker */
const startNode = (options) => {
  return new Promise((resolve) => {
    //node = new IPFS()
    node = new IPFS(options)
    node.on('error', (error) => {
      console.log(error.toString())
    })

    node.on('ready', () => {
      //console.log('ipfs node config: ' + JSON.stringify(node._options))
      resolve(node)
    })
  })
}

/* get a ready to use IPFS node */
const getNode = (options) => {
  return new Promise((resolve) => {
    if (!node) {
      return startNode(options).then((node) => resolve(node))
    }

    resolve(node)
  })
}

/* get the ready to use libp2p node */
const getLibp2pNode = (options) => {
  getNode(options)
  .then((node) => {
    Promise.all([node.libp2p])
      .then(([lp2pNode]) => {
        return lp2pNode
      })
  })
}

module.exports = {
  get: getNode,
  start: startNode,
  getLibp2p: getLibp2pNode
}
