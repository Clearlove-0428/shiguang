import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationScore} from '../wechat-reader.mjs';
test('roll-call spam never reaches the notification queue even with an explicit deadline',()=>{
 assert.equal(notificationScore('接龙，上课发言\n截止时间：9月15日08:00\n1.小明\n2.小红','课程群'),0);
 assert.equal(notificationScore('积龙 报名 截止9月19日16:05','课程群'),0);
 assert.ok(notificationScore('课程考试通知：9月20日上午9点到教室参加考试','课程群')>=4);
});
