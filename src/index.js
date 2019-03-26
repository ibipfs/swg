/* global self, Response */

/* TODOS
1. Checking for availabe GW and setting as default?
 */

'use strict'

const { createProxyServer } = require('ipfs-postmsg-proxy')
const { getResponse } = require('ipfs-http-response')
const { get, set } = require('idb-keyval')

const node = require('./node')
const statsView = require('./stats-view')

const getFormattedDate = (d) => `${d.getFullYear()}/${d.getMonth()}/${d.getDate()}`
const getFormattedTime = (d) => `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`

let ipfsNode
let libp2pNode

const options = {
        init: true,
        start: true,
        EXPERIMENTAL: {},
        preload: {
          enabled: false,
          addresses: [
            '/dnsaddr/service.edening.net/https'/*,
            `/dnsaddr/${self.location.hostname}/https`,
            '/dnsaddr/node0.preload.ipfs.io/https',
            '/dnsaddr/node1.preload.ipfs.io/https'*/
          ]
        },
        config: {
          dnsHost: `https://${self.location.hostname}`,
          Bootstrap: [
            '/dns4/ams-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd',
            '/dns4/lon-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3',
            '/dns4/service.edening.net/tcp/443/wss/ipfs/QmdC5xvY5SKnCzz4b4wLhwDLzRW3tbpyMjxqM3gay9WTVF',
            '/dns4/sfo-3.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM',
            '/dns4/sgp-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu',
            '/dns4/nyc-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm',
            '/dns4/nyc-2.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64',
            '/dns4/node0.preload.ipfs.io/tcp/443/wss/ipfs/QmZMxNdpMkewiVZLMRxaNxUeZpDUb34pWjZ1kZvsd16Zic',
            '/dns4/node1.preload.ipfs.io/tcp/443/wss/ipfs/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzJyGFsD6'
          ]
        }
    }

const resolve = (key) => {
  const magics = {
    "pov": "/ipfs/QmNj1Euitte9rF8PQ7We5cyMtFjiJ1mgpLRXePLV6z112m",
    "default": "/ipfs/QmVxnCSxhRZvG5XpLvbhP69gVRHzLjQLRXvipvEdXoEesf"
  }

  let path = magics.default

  if(magics[key]) {
    path = magics[key]
  }

  return path
}   

// Fetch Magic | TODO: Using pubsub?
const fetchMagic = (key) => {
  return fetchCID(resolve(key))
}

// Fetch IPNS | TODO: Checking for availabe GW before redirecting?
const fetchIPNS = (ipnsPath) => {
  //let gw = `${self.location.origin}`
  let gw = 'https://gateway.pinata.cloud';
  return Response.redirect(gw + ipnsPath)
}

// Fetch CID
const fetchCID = (ipfsPath) => {
  return node.get(options)
    .then((ipfsNode) => {
      return Promise.all([getResponse(ipfsNode, ipfsPath), get('fetched-cids')])
        .then(([resp, fetchedCIDs = []]) => {
          // Keep a record of the fetched CID (and fetch date)
          const d = new Date()

          fetchedCIDs.push({
            cid: ipfsPath.split('/ipfs/')[1],
            date: getFormattedDate(d),
            time: getFormattedTime(d)
          })

          return set('fetched-cids', fetchedCIDs).then(() => resp)
        })
        .catch((err) => new Response(err.toString()))
    })
}

// Fetch stats
const fetchStats = () => {
  return node.get(options)
    .then((ipfsNode) => {
      return Promise.all([ipfsNode.id(), ipfsNode.repo.stat(), get('fetched-cids'), get('start-date-time')])
        .then(([id, stat, fetchedCIDs = [], startDateTime = {}]) => {
          return new Response(statsView.render(id, stat, fetchedCIDs, startDateTime), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'text/html' }
          })
        })
        .catch((err) => new Response(err.toString()))
    })
}

// Fetch request
self.addEventListener('fetch', (event) => {
  const path = event.request.url

  const isMagic = path.startsWith(`${self.location.origin}/magic/`)

  const isIpnsRequest = path.startsWith(`${self.location.origin}/ipns/`)
  const isIpfsRequest = path.startsWith(`${self.location.origin}/ipfs/`)
  const isStatsRequest = path.startsWith(`${self.location.origin}/stats`)

  if(isMagic) {
    const match = path.match(/(\/magic\/.*?)(#|\?|$)/)
    const magicPath = match[1]
    const magicKey = magicPath.split('/magic/')[1]

    event.respondWith(fetchMagic(magicKey))
  }

  // Not intercepting path
  if (!(isIpnsRequest || isIpfsRequest || isStatsRequest)) {
    return
  }

  // Stats Page
  if (isStatsRequest) {
    event.respondWith(fetchStats())
  } else {
    // Gateway page
    if(isIpfsRequest) {
      const match = path.match(/(\/ipfs\/.*?)(#|\?|$)/)
      const ipfsPath = match[1]

      event.respondWith(fetchCID(ipfsPath))
    } else if(isIpnsRequest) {
      const match = path.match(/(\/ipns\/.*?)(#|\?|$)/)
      const ipnsPath = match[1]

      event.respondWith(fetchIPNS(ipnsPath));
    }
  }
})

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

// Activate service worker
self.addEventListener('activate', (event) => {
  node.get(options)
    .then((ipfs) => {

      ipfsNode = ipfs

      // Keep a record of the start date and time of the IPFS Node
      const d = new Date()

      set('fetched-cids', [])
      set('start-date-time', {
        date: getFormattedDate(d),
        time: getFormattedTime(d)
      })

      //Magic
      libp2pNode = node.getLibp2p()
    })
    .catch((err) => console.log(err))
  event.waitUntil(self.clients.claim())
})

createProxyServer(() => ipfsNode, {
  addListener: self.addEventListener && self.addEventListener.bind(self),
  removeListener: self.removeEventListener && self.removeEventListener.bind(self),
  postMessage (data) {
    self.clients.matchAll().then((clients) => {
      clients.forEach(client => client.postMessage(data))
    })
  }
})
