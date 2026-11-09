import { afterEach, describe, expect, it } from 'vitest';
import { listLanIpv4Addresses, listReachableLanAddresses, resolveListenHost } from '../src/daemon/bootstrap';

describe('daemon 监听地址', () => {
  const original = process.env.BRIDGE_HOST;
  afterEach(() => {
    if (original === undefined) delete process.env.BRIDGE_HOST;
    else process.env.BRIDGE_HOST = original;
  });

  it('默认只监听回环地址，不暴露到局域网', () => {
    delete process.env.BRIDGE_HOST;
    expect(resolveListenHost()).toBe('127.0.0.1');
  });

  it('空白的 BRIDGE_HOST 视为未设置', () => {
    process.env.BRIDGE_HOST = '  ';
    expect(resolveListenHost()).toBe('127.0.0.1');
  });

  it('可通过 BRIDGE_HOST 显式开放局域网', () => {
    process.env.BRIDGE_HOST = '0.0.0.0';
    expect(resolveListenHost()).toBe('0.0.0.0');
  });

  it('只听回环时不返回任何局域网地址', () => {
    expect(listReachableLanAddresses('127.0.0.1')).toEqual([]);
  });

  it('监听通配地址时返回全部局域网地址', () => {
    expect(listReachableLanAddresses('0.0.0.0')).toEqual(listLanIpv4Addresses());
  });
});
