import test from 'node:test';import assert from 'node:assert/strict';
import{reviewSource,migrateReviewSources,webSourceChoices,matchesReview}from'../public/review-policy.js';
test('公众号和网页按真实网址区分，不随转发平台混入聊天',()=>{
 assert.equal(reviewSource({platform:'wechat',origin_url:'https://mp.weixin.qq.com/s/abc'}),'official');
 assert.equal(reviewSource({platform:'wechat',origin_url:'https://example.edu/info/123.html'}),'web');
 assert.equal(reviewSource({origin_url:'https://mp.weixin.qq.com.evil.test/s/abc'}),'web');
 assert.equal(reviewSource({platform:'qq'}),'qq');
 assert.equal(reviewSource({origin_url:'invalid'}),'web');
});
test('旧选择迁移，空选择保留，网页可以按不同订阅栏目筛选',()=>{
 assert.deepEqual([...migrateReviewSources(['web'],true)],['official','web']);assert.equal(migrateReviewSources([]).size,0);
 const a={origin_url:'https://a.edu/info/a',external_id:'website:column1:https://a.edu/info/a',source:'教务通知'},b={...a,external_id:'website:column2:https://a.edu/info/b',source:'国际交流'},c={origin_url:'https://mp.weixin.qq.com/s/a'};
 const choices=webSourceChoices([a,b,c]);assert.equal(choices.length,2);const id=choices.find(x=>x.label.includes('教务')).id;
 assert.equal(matchesReview(a,new Set(['web']),'all',id),true);assert.equal(matchesReview(b,new Set(['web']),'all',id),false);assert.equal(matchesReview(c,new Set(['web'])),false);
});
