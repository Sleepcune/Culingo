import { describe,it,expect } from 'vitest';
import { isTrustedContext,isWebOrigin } from '../src/core/security';
describe('extension trust boundary',()=>{
  it('trusts extension documents even when they are open as tabs',()=>{expect(isTrustedContext('chrome-extension://abc/options.html','abc','abc','chrome-extension://abc/')).toBe(true);});
  it('denies page, different extension and absent sender identity',()=>{expect(isTrustedContext('https://example.com','abc','abc','chrome-extension://abc/')).toBe(false);expect(isTrustedContext('chrome-extension://abc/options.html','def','abc','chrome-extension://abc/')).toBe(false);expect(isTrustedContext(undefined,'abc','abc','chrome-extension://abc/')).toBe(false);});
  it('only accepts complete ordinary web origins for site settings',()=>{expect(isWebOrigin('https://example.com')).toBe(true);expect(isWebOrigin('http://localhost:1234')).toBe(true);expect(isWebOrigin('https://example.com/path')).toBe(false);expect(isWebOrigin('javascript:alert(1)')).toBe(false);});
});
