// テスト環境であることを示す環境変数を設定
process.env.NODE_ENV = 'test';
process.env.FUNCTIONS_EMULATOR = 'true';

// V2関数をテストするためのスクリプト
const v2 = require('./lib/indexV2');

// 利用可能なV2関数を表示
console.log('利用可能なV2関数:');
console.log(Object.keys(v2));

// 各関数の設定情報を表示
for (const funcName of Object.keys(v2)) {
  console.log(`\n${funcName}の設定:`, v2[funcName]);
} 