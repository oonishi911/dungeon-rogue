import { describe, expect, it } from 'vitest';
import { numberError, orderError, ruleText, textError } from './fieldCheck';

describe('ruleText', () => {
  it('整数・数・奇数を言い分ける', () => {
    expect(ruleText({ min: 1, max: 10 })).toBe('1〜10の整数');
    expect(ruleText({ min: 0, max: 1, step: 0.01 })).toBe('0〜1の数');
    expect(ruleText({ min: 0, max: 5, step: 1, integer: false })).toBe('0〜5の数');
    expect(ruleText({ min: 3, max: 15, step: 2, odd: true })).toBe('3〜15の奇数');
  });
});

describe('numberError', () => {
  const rule = { min: 1, max: 10 };

  it('決まりに合えば null', () => {
    expect(numberError('1', rule)).toBeNull();
    expect(numberError(' 10 ', rule)).toBeNull();
    expect(numberError('0.5', { min: 0, max: 1, step: 0.1 })).toBeNull();
  });

  it('原因と、正しい値の範囲を言う', () => {
    expect(numberError('', rule)).toBe('値が入っていません。1〜10の整数を入れてください。');
    expect(numberError('abc', rule)).toBe('「abc」は数ではありません。1〜10の整数を入れてください。');
    expect(numberError('0', rule)).toBe('0 は小さすぎます。1〜10の整数を入れてください。');
    expect(numberError('12', rule)).toBe('12 は大きすぎます。1〜10の整数を入れてください。');
    expect(numberError('2.5', rule)).toBe('2.5 は整数ではありません。1〜10の整数を入れてください。');
    expect(numberError('4', { min: 3, max: 15, step: 2, odd: true })).toBe('4 は偶数です。3〜15の奇数を入れてください。');
  });

  it('範囲の外なら、整数でないことより先に言う', () => {
    expect(numberError('10.5', rule)).toBe('10.5 は大きすぎます。1〜10の整数を入れてください。');
  });
});

describe('orderError', () => {
  it('大小が逆なら、相手の値を使って直し方を言う', () => {
    expect(orderError('atMost', '最小', 9, '最大', 7)).toBe('最小（9）が、最大（7）より大きくなっています。7以下にしてください。');
    expect(orderError('atLeast', '最大', 7, '最小', 9)).toBe('最大（7）が、最小（9）より小さくなっています。9以上にしてください。');
  });

  it('大小が合っていれば（同じ値も）null', () => {
    expect(orderError('atMost', '最小', 7, '最大', 7)).toBeNull();
    expect(orderError('atLeast', '最大', 9, '最小', 7)).toBeNull();
  });
});

describe('textError', () => {
  const rule = { max: 5, pattern: { test: /^[a-z]+$/, text: '英小文字だけ' }, taken: new Set(['bat']), takenText: 'ほかの敵が使っています' };

  it('決まりに合えば null', () => {
    expect(textError('rat', rule)).toBeNull();
  });

  it('原因と、正しい値を言う', () => {
    expect(textError(' ', rule)).toBe('値が入っていません。5文字までで入れてください。');
    expect(textError('abcdef', rule)).toBe('6文字あります。5文字までにしてください。');
    expect(textError('Bat1', rule)).toBe('「Bat1」は使えない形です。英小文字だけにしてください。');
    expect(textError('bat', rule)).toBe('「bat」はほかの敵が使っています。ほかの値にしてください。');
  });
});
