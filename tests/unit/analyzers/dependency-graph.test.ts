import { describe, it, expect } from 'vitest';
import { DependencyGraphBuilder } from '../../../src/core/analyzers/dependency-graph.js';
import { resolve } from 'node:path';

const fixturesDir = resolve(__dirname, '../../fixtures');

describe('DependencyGraphBuilder', () => {
  it('should build class hierarchy from Java helper files', async () => {
    const builder = new DependencyGraphBuilder();
    const graph = await builder.buildFromDirectory(fixturesDir, ['**/helpers/*.java']);

    // Should find all helper classes (BaseHelper, WebMethodsHelper, WebMethods, SeleniumWebDriverHelper)
    expect(graph.classes.size).toBe(4);
    expect(graph.classes.has('BaseHelper')).toBe(true);
    expect(graph.classes.has('WebMethodsHelper')).toBe(true);
    expect(graph.classes.has('WebMethods')).toBe(true);
    expect(graph.classes.has('SeleniumWebDriverHelper')).toBe(true);
  });

  it('should resolve inheritance chains correctly', async () => {
    const builder = new DependencyGraphBuilder();
    const graph = await builder.buildFromDirectory(fixturesDir, ['**/helpers/*.java']);

    // WebMethods → WebMethodsHelper → BaseHelper
    const chain = builder.getInheritanceChain('WebMethods');
    expect(chain).toEqual(['WebMethods', 'WebMethodsHelper', 'BaseHelper']);
  });

  it('should resolve methods across the inheritance chain', async () => {
    const builder = new DependencyGraphBuilder();
    await builder.buildFromDirectory(fixturesDir, ['**/helpers/*.java']);

    // click() is defined in BaseHelper, should be found from WebMethods
    const resolved = builder.resolveMethod('WebMethods', 'click');
    expect(resolved).not.toBeNull();
    expect(resolved!.className).toBe('BaseHelper');
    expect(resolved!.inheritancePath).toEqual(['WebMethods', 'WebMethodsHelper', 'BaseHelper']);
  });

  it('should find methods defined in the child class', async () => {
    const builder = new DependencyGraphBuilder();
    await builder.buildFromDirectory(fixturesDir, ['**/helpers/*.java']);

    // login() is defined directly on WebMethods
    const resolved = builder.resolveMethod('WebMethods', 'login');
    expect(resolved).not.toBeNull();
    expect(resolved!.className).toBe('WebMethods');
  });

  it('should detect Selenium calls in methods', async () => {
    const builder = new DependencyGraphBuilder();
    await builder.buildFromDirectory(fixturesDir, ['**/helpers/*.java']);

    // findElement is in BaseHelper
    const baseHelper = graph(builder).classes.get('BaseHelper')!;
    const findElementMethod = baseHelper.methods.find((m) => m.name === 'findElement');
    expect(findElementMethod).toBeDefined();
    expect(findElementMethod!.containsSeleniumCalls).toBe(true);
  });

  it('should build from in-memory files', () => {
    const builder = new DependencyGraphBuilder();
    const graph = builder.buildFromFiles([
      {
        path: 'Parent.java',
        content: `
          import org.openqa.selenium.*;
          public class Parent {
            public void doStuff() {
              driver.findElement(By.id("test")).click();
            }
          }
        `,
      },
      {
        path: 'Child.java',
        content: `
          public class Child extends Parent {
            public void doMore() {
              doStuff();
            }
          }
        `,
      },
    ]);

    expect(graph.classes.size).toBe(2);
    expect(builder.getInheritanceChain('Child')).toEqual(['Child', 'Parent']);

    const resolved = builder.resolveMethod('Child', 'doStuff');
    expect(resolved!.className).toBe('Parent');
  });
});

// Helper to access private graph
function graph(builder: DependencyGraphBuilder): any {
  return (builder as any).graph;
}
