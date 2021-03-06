/* global self, Response */

'use strict'

const { getFastest } = require('../../public-gateway-checker')

const { createProxyServer } = require('ipfs-postmsg-proxy')
const { getResponse } = require('ipfs-http-response')
const { get, set } = require('idb-keyval')

const node = require('./node')
const statsView = require('./stats-view')

const getFormattedDate = (d) => `${d.getFullYear()}/${d.getMonth()}/${d.getDate()}`
const getFormattedTime = (d) => `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`

const hostname = `${self.location.hostname}`

let swPath // Dynamically be assigned during installation

let gw = 'https://ipfs.io'

let iRecordAt

let ipfsNode

const options = {
        init: true,
        start: true,
        EXPERIMENTAL: {
          pubsub: true
        },
        preload: {
          enabled: true,
          addresses: [
            /// custom
            //'/dnsaddr/<PreloadNodeHost>/https'
            `/dnsaddr/${hostname}/https`,
            '/dnsaddr/gateway.pinata.cloud/https',
            //'/dnsaddr/js-ipfs.localhost/http', // `{host}/api/v0/refs?r=true&arg={hash}` not found
            /// official
            '/dnsaddr/node0.preload.ipfs.io/https',
            '/dnsaddr/node1.preload.ipfs.io/https'
          ]
        },
        config: {
          dnsHost: `https://${hostname}`,
          Bootstrap: [
            /// custom
            //'/dns4/localhost/tcp/<port>/(ws|wss)/ipfs/<PeerId>', // Local IPFS Peer
            //'/dns4/<RemoteHost>/tcp/443/wss/ipfs/<PeerId>' // Remote IPFS Peer
            /// official
            '/dns4/ams-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd',
            '/dns4/lon-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3',
            `/dns4/service.edening.net/tcp/443/wss/ipfs/QmdC5xvY5SKnCzz4b4wLhwDLzRW3tbpyMjxqM3gay9WTVF`,
            '/dns4/sfo-3.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM',
            '/dns4/sgp-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu',
            '/dns4/nyc-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm',
            '/dns4/nyc-2.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64',
            '/dns4/node0.preload.ipfs.io/tcp/443/wss/ipfs/QmZMxNdpMkewiVZLMRxaNxUeZpDUb34pWjZ1kZvsd16Zic',
            '/dns4/node1.preload.ipfs.io/tcp/443/wss/ipfs/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzJyGFsD6'
          ]
        }
    }

const fetchIPNS = (ipnsPath) => {
  return getFastest()
  .then((result) => {
    console.log('getFastest() result: ' + result)

    gw = result

    return Response.redirect(gw + ipnsPath)
  }, (reason) => {
    console.log('getFastest() failed: ' + reason)

    return new Response('getFastest() failed: ' + reason)
  })
  .catch((err) => {
    console.log('getFastest() error: ' + err)

    return new Response('getFastest() error: ' + err)
  })
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

  const isIRecordRequest = path.startsWith(`${self.location.origin}${swPath}/irecord/`)
  const isIpnsRequest = path.startsWith(`${self.location.origin}${swPath}/ipns/`)
  const isIpfsRequest = path.startsWith(`${self.location.origin}${swPath}/ipfs/`)
  const isStatsRequest = path.startsWith(`${self.location.origin}${swPath}/stats`)

  // Not intercepting path
  if (!(isIRecordRequest || isIpnsRequest || isIpfsRequest || isStatsRequest)) {
    return
  }

  // Stats Page
  if (isStatsRequest) {
    event.respondWith(fetchStats())
  } else {
    // Magic page
    let matchedPath

    if(isIpfsRequest) {
      const match = path.match(/(\/ipfs\/.*?)(#|\?|$)/)
      //const match = isLocal? path.match(/(\/ipfs\/.*?)(#|\?|$)/) : path.match(/(\/ipns\/QmQebw1nSLGzrmV9jUKzhCqpFPgdioYBmepLu8kFZs53vn\/ipfs\/.*?)(#|\?|$)/)
      matchedPath = match[1]
      matchedPath = matchedPath.substring(matchedPath.lastIndexOf('ipfs') - 1)

      event.respondWith(fetchCID(matchedPath))
    } else if(isIpnsRequest) {
      const match = path.match(/(\/ipns\/.*?)(#|\?|$)/)
      //const match = isLocal? path.match(/(\/ipns\/.*?)(#|\?|$)/) : path.match(/(\/ipns\/QmQebw1nSLGzrmV9jUKzhCqpFPgdioYBmepLu8kFZs53vn\/ipns\/.*?)(#|\?|$)/)
      matchedPath = match[1]
      matchedPath = matchedPath.substring(matchedPath.lastIndexOf('ipns') - 1)

      event.respondWith(fetchIPNS(matchedPath))
    } else if(isIRecordRequest) {
      event.respondWith(fetchCID(iRecordAt))
    }
  }
})

// Install service worker
self.addEventListener('install', (event) => {
  console.log('Installing service worker ...')

  const pathname = self.location.pathname

  console.log('pathname: ' + pathname)

  swPath = pathname.substring(0, pathname.lastIndexOf('/'))

  console.log('swPath: ' + swPath)

  event.waitUntil(self.skipWaiting())
})

// Activate service worker
self.addEventListener('activate', (event) => {
  console.log('Activating service worker ...')

  /*getFastest()
  .then((result) => {
    console.log('getFastest() result: ' + result)

    gw = result
  }, (reason) => {
    console.log('getFastest() failed: ' + reason)
  })
  .catch(err => console.log('getFastest() error: ' + err))
  .finally(() => {
    console.log('After getFastest() gw: ' + gw)
  })*/

  node.get(options)
    .then((ipfs) => {

      iRecordAt = '/ipfs/QmZdLWmy9WcLdYKV3PpuP4DkG2Pt222cVftPLas2xHseqW'

      ipfsNode = ipfs

      // Keep a record of the start date and time of the IPFS Node
      const d = new Date()

      set('fetched-cids', [])
      set('start-date-time', {
        date: getFormattedDate(d),
        time: getFormattedTime(d)
      })
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
