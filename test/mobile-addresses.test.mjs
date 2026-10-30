import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankAddresses,networkChoices} from '../mobile-addresses.mjs';
import {rankAddresses as uiRank} from '../public/mobile-ui.js';
test('pairing offers physical LAN before virtual adapters and loopback',()=>{
 const row=address=>[{address,family:'IPv4',internal:false}];
 const list=networkChoices({vgate0:row('172.30.198.106'),'vEthernet (WSL)':row('172.31.0.1'),WLAN:row('192.168.5.30')},43129);
 assert.equal(list[0].origin,'http://192.168.5.30:43129');assert.equal(list[0].name,'WLAN');assert.ok(list[1].virtual);assert.match(list.at(-1).origin,/127.0.0.1/);
 assert.deepEqual(uiRank(list.toReversed()),rankAddresses(list.toReversed()));
});
test('physical 172 LAN remains valid; public and unconfigured adapters are excluded',()=>{
 const list=networkChoices({Ethernet:[{family:'IPv4',address:'172.20.1.4'}],VPN:[{family:'IPv4',address:'10.0.0.2'}],Other:[{family:'IPv4',address:'169.254.1.1'},{family:'IPv4',address:'8.8.8.8'}]},43129);
 assert.equal(list.length,3);assert.equal(list[0].name,'Ethernet');
});
test('already running older PC response sorts WLAN candidate ahead of virtual private addresses',()=>{
 assert.equal(rankAddresses(['http://172.30.198.106:43129','http://127.0.0.1:43129','http://192.168.5.30:43129'])[0],'http://192.168.5.30:43129');
});
