/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { sep as pathSep } from 'path';
import { ConfigAggregator } from './config/configAggregator';
import { ConfigFile } from './config/configFile';
import { defaults, env } from '@salesforce/kit';
import { SchemaValidator } from './schema/validator';
import { resolveProjectPath, resolveProjectPathSync, SFDX_PROJECT_JSON } from './util/internal';
import { SfdxError } from './sfdxError';
import { sfdc } from './util/sfdc';
/**
 * The sfdx-project.json config object. This file determines if a folder is a valid sfdx project.
 *
 * *Note:* Any non-standard (not owned by Salesforce) properties stored in sfdx-project.json should
 * be in a top level property that represents your project or plugin.
 *
 * ```
 * const project = await SfdxProjectJson.retrieve();
 * const myPluginProperties = project.get('myplugin') || {};
 * myPluginProperties.myprop = 'someValue';
 * project.set('myplugin', myPluginProperties);
 * await project.write();
 * ```
 *
 * **See** [force:project:create](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_ws_create_new.htm)
 */
export class SfdxProjectJson extends ConfigFile {
  constructor(options) {
    super(options);
  }
  static getFileName() {
    return SFDX_PROJECT_JSON;
  }
  static getDefaultOptions(isGlobal = false) {
    const options = ConfigFile.getDefaultOptions(isGlobal, SfdxProjectJson.getFileName());
    options.isState = false;
    return options;
  }
  async read() {
    const contents = await super.read();
    // Verify that the configObject does not have upper case keys; throw if it does.  Must be heads down camel case.
    const upperCaseKey = sfdc.findUpperCaseKeys(this.toObject(), SfdxProjectJson.BLOCKLIST);
    if (upperCaseKey) {
      throw SfdxError.create('@salesforce/core', 'core', 'InvalidJsonCasing', [upperCaseKey, this.getPath()]);
    }
    await this.schemaValidate();
    return contents;
  }
  async write(newContents) {
    // Verify that the configObject does not have upper case keys; throw if it does.  Must be heads down camel case.
    const upperCaseKey = sfdc.findUpperCaseKeys(newContents, SfdxProjectJson.BLOCKLIST);
    if (upperCaseKey) {
      throw SfdxError.create('@salesforce/core', 'core', 'InvalidJsonCasing', [upperCaseKey, this.getPath()]);
    }
    await this.schemaValidate();
    return super.write(newContents);
  }
  getContents() {
    return super.getContents();
  }
  getDefaultOptions(options) {
    const defaultOptions = {
      isState: false
    };
    Object.assign(defaultOptions, options || {});
    return defaultOptions;
  }
  /**
   * Validates sfdx-project.json against the schema.
   *
   * Set the `SFDX_PROJECT_JSON_VALIDATION` environment variable to `true` to throw an error when schema validation fails.
   * A warning is logged by default when the file is invalid.
   *
   * ***See*** [sfdx-project.schema.json] (https://raw.githubusercontent.com/forcedotcom/schemas/master/schemas/sfdx-project.schema.json)
   */
  async schemaValidate() {
    if (!this.hasRead) {
      // read calls back into this method after necessarily setting this.hasRead=true
      await this.read();
    } else {
      try {
        const projectJsonSchemaPath = require.resolve('@salesforce/schemas/sfdx-project.schema.json');
        const validator = new SchemaValidator(this.logger, projectJsonSchemaPath);
        await validator.load();
        await validator.validate(this.getContents());
      } catch (err) {
        if (env.getBoolean('SFDX_PROJECT_JSON_VALIDATION', false)) {
          err.name = 'SfdxSchemaValidationError';
          const sfdxError = SfdxError.wrap(err);
          sfdxError.actions = [this.messages.getMessage('SchemaValidationErrorAction', [this.getPath()])];
          throw sfdxError;
        } else {
          this.logger.warn(this.messages.getMessage('SchemaValidationWarning', [this.getPath(), err.message]));
        }
      }
    }
  }
  /**
   * Returns the `packageDirectories` within sfdx-project.json, first reading
   * and validating the file if necessary.
   */
  async getPackageDirectories() {
    // Ensure sfdx-project.json has first been read and validated.
    if (!this.hasRead) {
      await this.read();
    }
    const contents = this.getContents();
    const packageDirs = contents.packageDirectories.map(packageDir => {
      // Change packageDir paths to have path separators that match the OS
      const regex = pathSep === '/' ? /\\/g : /\//g;
      packageDir.path = packageDir.path.replace(regex, pathSep);
      return packageDir;
    });
    return packageDirs;
  }
}
SfdxProjectJson.BLOCKLIST = ['packageAliases'];
/**
 * Represents an SFDX project directory. This directory contains a {@link SfdxProjectJson} config file as well as
 * a hidden .sfdx folder that contains all the other local project config files.
 *
 * ```
 * const project = await SfdxProject.resolve();
 * const projectJson = await project.resolveProjectConfig();
 * console.log(projectJson.sfdcLoginUrl);
 * ```
 */
export class SfdxProject {
  /**
   * Do not directly construct instances of this class -- use {@link SfdxProject.resolve} instead.
   *
   * @ignore
   */
  constructor(path) {
    this.path = path;
  }
  /**
   * Get a Project from a given path or from the working directory.
   * @param path The path of the project.
   *
   * **Throws** *{@link SfdxError}{ name: 'InvalidProjectWorkspace' }* If the current folder is not located in a workspace.
   */
  static async resolve(path) {
    const _path = path || process.cwd();
    if (!SfdxProject.instances.has(_path)) {
      const project = new SfdxProject(await this.resolveProjectPath(_path));
      SfdxProject.instances.set(_path, project);
    }
    // @ts-ignore Because of the pattern above this is guaranteed to return an instance
    return SfdxProject.instances.get(_path);
  }
  /**
   * Performs an upward directory search for an sfdx project file. Returns the absolute path to the project.
   *
   * @param dir The directory path to start traversing from.
   *
   * **Throws** *{@link SfdxError}{ name: 'InvalidProjectWorkspace' }* If the current folder is not located in a workspace.
   *
   * **See** {@link traverseForFile}
   *
   * **See** [process.cwd()](https://nodejs.org/api/process.html#process_process_cwd)
   */
  static async resolveProjectPath(dir) {
    return resolveProjectPath(dir);
  }
  /**
   * Performs a synchronous upward directory search for an sfdx project file. Returns the absolute path to the project.
   *
   * @param dir The directory path to start traversing from.
   *
   * **Throws** *{@link SfdxError}{ name: 'InvalidProjectWorkspace' }* If the current folder is not located in a workspace.
   *
   * **See** {@link traverseForFileSync}
   *
   * **See** [process.cwd()](https://nodejs.org/api/process.html#process_process_cwd)
   */
  static resolveProjectPathSync(dir) {
    return resolveProjectPathSync(dir);
  }
  /**
   * Returns the project path.
   */
  getPath() {
    return this.path;
  }
  /**
   * Get the sfdx-project.json config. The global sfdx-project.json is used for user defaults
   * that are not checked in to the project specific file.
   *
   * *Note:* When reading values from {@link SfdxProjectJson}, it is recommended to use
   * {@link SfdxProject.resolveProjectConfig} instead.
   *
   * @param isGlobal True to get the global project file, otherwise the local project config.
   */
  async retrieveSfdxProjectJson(isGlobal = false) {
    const options = SfdxProjectJson.getDefaultOptions(isGlobal);
    if (isGlobal) {
      if (!this.sfdxProjectJsonGlobal) {
        this.sfdxProjectJsonGlobal = await SfdxProjectJson.create(options);
      }
      return this.sfdxProjectJsonGlobal;
    } else {
      options.rootFolder = this.getPath();
      if (!this.sfdxProjectJson) {
        this.sfdxProjectJson = await SfdxProjectJson.create(options);
      }
      return this.sfdxProjectJson;
    }
  }
  /**
   * The project config is resolved from local and global {@link SfdxProjectJson},
   * {@link ConfigAggregator}, and a set of defaults. It is recommended to use
   * this when reading values from SfdxProjectJson.
   * @returns A resolved config object that contains a bunch of different
   * properties, including some 3rd party custom properties.
   */
  async resolveProjectConfig() {
    if (!this.projectConfig) {
      // Get sfdx-project.json from the ~/.sfdx directory to provide defaults
      const global = await this.retrieveSfdxProjectJson(true);
      const local = await this.retrieveSfdxProjectJson();
      await global.read();
      await local.read();
      const defaultValues = {
        sfdcLoginUrl: 'https://login.salesforce.com'
      };
      this.projectConfig = defaults(local.toObject(), global.toObject(), defaultValues);
      // Add fields in sfdx-config.json
      Object.assign(this.projectConfig, (await ConfigAggregator.create()).getConfig());
      // LEGACY - Allow override of sfdcLoginUrl via env var FORCE_SFDC_LOGIN_URL
      if (process.env.FORCE_SFDC_LOGIN_URL) {
        this.projectConfig.sfdcLoginUrl = process.env.FORCE_SFDC_LOGIN_URL;
      }
    }
    return this.projectConfig;
  }
}
// Cache of SfdxProject instances per path.
SfdxProject.instances = new Map();
//# sourceMappingURL=sfdxProject.js.map