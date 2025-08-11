import colors from 'colors/safe.js';

import { get } from '@clevercloud/client/esm/api/v2/addon.js';
import { confirm } from '../lib/prompts.js';
import { Logger } from '../logger.js';
import { findOwnerId } from '../models/addon.js';
import { resolveRealId } from '../models/ids-resolver.js';
import { sendToApi } from '../models/send-to-api.js';
import { formatTable as initFormatTable } from '../format-table.js';

const formatTable = initFormatTable();

/**
 * @typedef UserData
 * @property {string} id
 * @property {string} name
 * @property {string} password
 * @property {object} privileges
 * @property {boolean} privileges.login
 * @property {boolean} privileges.createRole
 */

/**
 * @callback providerCallback
 * @param {object} options
 * @param {string} options.ownerId - The owner ID of the addon.
 * @param {string} options.addonId - The addon ID.
 */

/**
 * Resolve the provider for an addon.
 *
 * @param {string} addonIdOrReadId
 * @param {Object.<string, providerCallback>} providersCallback
 * @returns
 */
async function providerRouter (addonIdOrReadId, providersCallback) {
  const addonId = await resolveRealId(addonIdOrReadId);
  const ownerId = await findOwnerId(null, addonId);

  const { provider: { id: providerId } } = await get({ id: ownerId, addonId }).then(sendToApi);

  for (const id of Object.keys(providersCallback)) {
    if (id === providerId) {
      await providersCallback[id]({ ownerId, addonId });
      return;
    }
  }

  throw new Error(`Unsupported provider ${providerId}`);
}

/**
 * List users for an addon.
 *
 * @param {Object} params
 * @param {{ addon: string }} params.namedArgs
 * @param {{ 'show-password': boolean, format: ?string }} params.options
 */
export async function list (params) {
  const { addon: addonIdOrReadId } = params.namedArgs;
  const { 'show-password': showPassword, format } = params.options;

  /** @type {UserData[]} */
  let users = null;

  await providerRouter(addonIdOrReadId, {
    'postgresql-addon': async ({ ownerId, addonId }) => {
      users = await getUsers({
        ownerId,
        addonId,
      }).then(sendToApi);
    },
  });

  // hide passwords
  users = users.map((user) => {
    return {
      ...user,
      password: showPassword ? user.password : '********',
    };
  });

  switch (format) {
    case 'json':
      Logger.printJson(users);
      break;
    case 'human':
    default: {
      const formattedUsers = users.map((user) => {
        return [
          user.id,
          user.privileges.login ? colors.bold.green(user.name) : colors.gray(user.name),
          user.password,
          user.privileges.login ? 'Yes' : 'No',
          user.privileges.createRole ? 'Yes' : 'No',
        ];
      });
      formattedUsers.unshift(['ID', 'Name', 'Password', 'Can login', 'Can create role']);
      Logger.println(formatTable(formattedUsers));
    }
  }
}

/**
 * Show details of a user for an add-on.
 *
 * @param {Object} params
 * @param {{ addon: string, user: string }} params.namedArgs
 * @param {{ 'show-password': boolean, format: ?string }} params.options
 */
export async function show (params) {
  const { addon: addonIdOrReadId, user: userId } = params.namedArgs;
  const { 'show-password': showPassword, format } = params.options;

  /** @type {UserData[]} */
  let users = null;

  await providerRouter(addonIdOrReadId, {
    'postgresql-addon': async ({ ownerId, addonId }) => {
      users = await getUser({
        ownerId,
        addonId,
        userId,
      }).then(sendToApi);
    },
  });

  if (!users || users.length === 0) {
    Logger.error('User not found');
    return;
  }

  // hide password
  const user = {
    ...users[0],
    password: showPassword ? users[0].password : '********',
  };

  switch (format) {
    case 'json':
      Logger.printJson(user);
      break;
    case 'human':
    default:
      Logger.println(formatTable([
        ['ID:', user.id],
        ['Name:', user.privileges.login ? colors.bold.green(user.name) : colors.gray(user.name)],
        ['Password:', user.password],
        ['Can login:', user.privileges.login],
        ['Can create role:', user.privileges.createRole],
      ]));
  }
}

/**
 * Create a user for an addon.
 *
 * @param {Object} params
 * @param {{ addon: string }} params.namedArgs
 * @param {{ 'show-password': boolean, format: ?string }} params.options
 */
export async function create (params) {
  const { addon: addonIdOrReadId } = params.namedArgs;
  const { 'show-password': showPassword, format } = params.options;

  /** @type {UserData} */
  let user = null;

  await providerRouter(addonIdOrReadId, {
    'postgresql-addon': async ({ ownerId, addonId }) => {
      user = await createUser({
        ownerId,
        addonId,
      }).then(sendToApi);
    },
  });

  // hide password
  user = {
    ...user,
    password: showPassword ? user.password : '********',
  };

  switch (format) {
    case 'json':
      Logger.printJson(user);
      break;
    case 'human':
    default:
      Logger.println(formatTable([
        ['ID:', user.id],
        ['Name:', user.name],
        ['Password:', user.password],
      ]));
  }
}

/**
 * Rotate password for a user.
 *
 * @param {Object} params
 * @param {{ addon: string, user: string }} params.namedArgs
 * @param {{ 'show-password': boolean, format: ?string }} params.options
 */
export async function rotatePassword (params) {
  const { addon: addonIdOrReadId, user: userId } = params.namedArgs;
  const { 'show-password': showPassword, format } = params.options;

  /** @type {UserData} */
  let user = null;

  await providerRouter(addonIdOrReadId, {
    'postgresql-addon': async ({ ownerId, addonId }) => {
      user = await rotateUserPassword({
        ownerId,
        addonId,
        userId,
      }).then(sendToApi);
    },
  });

  // hide password
  user = {
    ...user,
    password: showPassword ? user.password : '********',
  };

  switch (format) {
    case 'json':
      Logger.printJson(user);
      break;
    case 'human':
    default:
      Logger.println('User password rotated successfully!');
      Logger.println(`ID: ${user.id}`);
      Logger.println(`Name: ${user.name}`);
      Logger.println(`Password: ${user.password}`);
  }
}

/**
 * Delete a user.
 *
 * @param {Object} params
 * @param {{ addon: string, user: string }} params.namedArgs
 * @param {{ yes: boolean }} params.options
 */
export async function delete_ (params) {
  const { addon: addonIdOrReadId, user: userId } = params.namedArgs;
  const { yes: skipConfirmation } = params.options;

  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!skipConfirmation) {
    await confirm(
      'Deleting the user cannot be undone, are you sure?',
      'No confirmation, aborting user deletion',
    );
  }

  await providerRouter(addonIdOrReadId, {
    'postgresql-addon': async ({ ownerId, addonId }) => {
      await deleteUser({
        ownerId,
        addonId,
        userId,
      }).then(sendToApi);
    },
  });

  Logger.println(`User ${userId} deleted successfully!`);
}

/**
 * Update a user's privileges.
 *
 * @param {Object} params
 * @param {{ addon: string, user: string }} params.namedArgs
 * @param {{ login: ?boolean, 'create-role': ?boolean }} params.options
 */
export async function update (params) {
  const { addon: addonIdOrReadId, user: userId } = params.namedArgs;
  const {
    login,
    'create-role': createRole,
  } = params.options;

  if (!userId) {
    throw new Error('User ID is required');
  }

  if (login === null && createRole === null) {
    throw new Error('Either login or create-role must be specified');
  }

  await providerRouter(addonIdOrReadId, {
    'postgresql-addon': async ({ ownerId, addonId }) => {
      await updateUser({
        ownerId,
        addonId,
        userId,
        privileges: {
          login,
          createRole,
        },
      }).then(sendToApi);
    },
  });

  Logger.println(`User ${userId} updated successfully!`);
}

/**
 * GET /v4/postgresql/organisations/{ownerId}/postgresql/{addonId}/users
 *
 * @param {Object} params
 * @param {string} params.ownerId
 * @param {string} params.addonId
 */
function getUsers (params) {
  return Promise.resolve({
    method: 'GET',
    url: `/v4/postgresql/organisations/${params.ownerId}/postgresql/${params.addonId}/users`,
    headers: { Accept: 'application/json' },
  });
}

/**
 * GET /v4/postgresql/organisations/{ownerId}/postgresql/{addonId}/users?userId={userId}
 *
 * @param {Object} params
 * @param {string} params.ownerId
 * @param {string} params.addonId
 * @param {string} params.userId
 */
function getUser (params) {
  return Promise.resolve({
    method: 'GET',
    url: `/v4/postgresql/organisations/${params.ownerId}/postgresql/${params.addonId}/users?userId=${params.userId}`,
    headers: { Accept: 'application/json' },
  });
}

/**
 * POST /v4/postgresql/organisations/{ownerId}/postgresql/{addonId}/users
 * @param {Object} params
 * @param {string} params.ownerId
 * @param {string} params.addonId
 */
function createUser (params) {
  return Promise.resolve({
    method: 'POST',
    url: `/v4/postgresql/organisations/${params.ownerId}/postgresql/${params.addonId}/users`,
    headers: { Accept: 'application/json' },
  });
}

/**
 * POST /v4/postgresql/organisations/{ownerId}/postgresql/{addonId}/users/{userId}/rotate-password
 *
 * @param {Object} params
 * @param {string} params.ownerId
 * @param {string} params.addonId
 * @param {string} params.userId
 */
function rotateUserPassword (params) {
  return Promise.resolve({
    method: 'POST',
    url: `/v4/postgresql/organisations/${params.ownerId}/postgresql/${params.addonId}/users/${params.userId}/rotate-password`,
    headers: { Accept: 'application/json' },
  });
}

/**
 * DELETE /v4/postgresql/organisations/{ownerId}/postgresql/{addonId}/users/{userId}
 *
 * @param {Object} params
 * @param {string} params.ownerId
 * @param {string} params.addonId
 * @param {string} params.userId
 */
function deleteUser (params) {
  return Promise.resolve({
    method: 'DELETE',
    url: `/v4/postgresql/organisations/${params.ownerId}/postgresql/${params.addonId}/users/${params.userId}`,
    headers: { Accept: 'application/json' },
  });
}

/**
 * PATCH /v4/postgresql/organisations/{ownerId}/postgresql/{addonId}/users/{userId}
 *
 * @param {Object} params
 * @param {string} params.ownerId
 * @param {string} params.addonId
 * @param {string} params.userId
 * @param {{ login: ?boolean, createRole: ?boolean }} params.privileges
 */
function updateUser (params) {
  return Promise.resolve({
    method: 'PATCH',
    url: `/v4/postgresql/organisations/${params.ownerId}/postgresql/${params.addonId}/users/${params.userId}`,
    headers: { Accept: 'application/json' },
    body: JSON.stringify(params.privileges),
  });
}
