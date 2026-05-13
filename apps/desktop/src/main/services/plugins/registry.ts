import type { PluginManifest, PluginPermission, PluginAPI, PluginInstance, PluginExtension, PluginExtensionPoint } from './types.js';
import fs from 'node:fs/promises';
import path from 'node:path';

interface PluginRegistryState {
  plugins: Map<string, PluginInstance>;
  extensions: Map<PluginExtensionPoint, PluginExtension[]>;
  pluginOrder: string[];
}

export class PluginRegistry {
  private state: PluginRegistryState;
  private pluginsDir: string;
  private apiFactory: (permissions: PluginPermission[]) => PluginAPI;

  constructor(pluginsDir: string, apiFactory: (permissions: PluginPermission[]) => PluginAPI) {
    this.pluginsDir = pluginsDir;
    this.apiFactory = apiFactory;
    this.state = {
      plugins: new Map(),
      extensions: new Map(),
      pluginOrder: [],
    };
  }

  async scanPlugins(): Promise<PluginManifest[]> {
    const manifests: PluginManifest[] = [];
    try {
      const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(this.pluginsDir, entry.name, 'manifest.json');
          try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(content) as PluginManifest;
            if (manifest.id && manifest.name && manifest.main) {
              manifests.push(manifest);
            }
          } catch (err) {
            console.warn('Failed to parse plugin manifest:', err);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to scan plugins:', err);
    }
    return manifests;
  }

  async loadPlugin(manifest: PluginManifest): Promise<PluginInstance> {
    const existing = this.state.plugins.get(manifest.id);
    if (existing) return existing;

    const permissions = manifest.permissions ?? [];
    const api = this.apiFactory(permissions);

    const instance: PluginInstance = {
      manifest,
      api,
      activated: false,
      activate: async () => {
        if (instance.activated) return;
        try {
          const pluginPath = path.join(this.pluginsDir, manifest.id, manifest.main);
          const pluginModule = await import(pluginPath);
          if (typeof pluginModule.activate === 'function') {
            await pluginModule.activate(api);
          }
          instance.activated = true;
          this.state.pluginOrder.push(manifest.id);
        } catch (err) {
          throw new Error(`Failed to activate plugin ${manifest.id}: ${err}`);
        }
      },
      deactivate: async () => {
        if (!instance.activated) return;
        try {
          const pluginPath = path.join(this.pluginsDir, manifest.id, manifest.main);
          const pluginModule = await import(pluginPath);
          if (typeof pluginModule.deactivate === 'function') {
            await pluginModule.deactivate(api);
          }
          instance.activated = false;
          this.state.pluginOrder = this.state.pluginOrder.filter((id) => id !== manifest.id);
          this.removeExtensions(manifest.id);
        } catch (err) {
          console.warn('Failed to deactivate plugin:', err);
        }
      },
    };

    this.state.plugins.set(manifest.id, instance);
    return instance;
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const instance = this.state.plugins.get(pluginId);
    if (instance) {
      await instance.deactivate();
      this.state.plugins.delete(pluginId);
      this.removeExtensions(pluginId);
    }
  }

  registerExtension(extension: PluginExtension): void {
    const list = this.state.extensions.get(extension.type) ?? [];
    list.push(extension);
    this.state.extensions.set(extension.type, list);
  }

  getExtensions(type: PluginExtensionPoint): PluginExtension[] {
    return this.state.extensions.get(type) ?? [];
  }

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.state.plugins.get(pluginId);
  }

  getAllPlugins(): PluginInstance[] {
    return Array.from(this.state.plugins.values());
  }

  getActivatedPlugins(): PluginInstance[] {
    return Array.from(this.state.plugins.values()).filter((p) => p.activated);
  }

  private removeExtensions(pluginId: string): void {
    for (const [type, extensions] of this.state.extensions) {
      this.state.extensions.set(
        type,
        extensions.filter((e) => e.pluginId !== pluginId),
      );
    }
  }
}
