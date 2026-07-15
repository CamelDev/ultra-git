import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { fixPath } from '../env';
import * as child_process from 'child_process';

describe('fixPath', () => {
  let originalPlatform: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    originalPlatform = process.platform;
    originalPath = process.env.PATH;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env.PATH = originalPath;
  });

  test('should do nothing on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.PATH = 'C:\\Windows';
    
    fixPath();
    
    expect(process.env.PATH).toBe('C:\\Windows');
  });

  test('should merge paths from shell stdout on non-windows platform', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    process.env.PATH = '/usr/bin:/bin';
    
    const execSpy = spyOn(child_process, 'execSync').mockReturnValue(
      Buffer.from('/opt/homebrew/bin:/usr/local/bin\n', 'utf-8') as never
    );
    
    fixPath();
    
    expect(execSpy).toHaveBeenCalled();
    expect(process.env.PATH).toContain('/opt/homebrew/bin');
    expect(process.env.PATH).toContain('/usr/local/bin');
    expect(process.env.PATH).toContain('/usr/bin');
    expect(process.env.PATH).toContain('/bin');
    
    execSpy.mockRestore();
  });

  test('should apply fallback if shell command fails', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    process.env.PATH = '/usr/bin';
    
    const execSpy = spyOn(child_process, 'execSync').mockImplementation(() => {
      throw new Error('Command failed');
    });
    
    fixPath();
    
    expect(execSpy).toHaveBeenCalled();
    expect(process.env.PATH).toContain('/opt/homebrew/bin');
    expect(process.env.PATH).toContain('/usr/local/bin');
    expect(process.env.PATH).toContain('/usr/bin');
    
    execSpy.mockRestore();
  });
});
