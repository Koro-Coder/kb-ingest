// In-memory stand-ins for the admin stores, so the auth and authorisation
// tests need no mongod, no network and no credentials. Same contract as
// server/store/{adminStore,adminSessionStore}.js — if a method is added there,
// add it here or the tests stop covering it.

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createAdminStore(seed = []) {
  const byEmail = new Map();
  for (const admin of seed) {
    byEmail.set(normaliseEmail(admin.email), { ...admin, email: normaliseEmail(admin.email) });
  }

  return {
    async findByEmail(email) {
      return clone(byEmail.get(normaliseEmail(email))) || null;
    },

    async list() {
      return Array.from(byEmail.values())
        .map(clone)
        .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));
    },

    async countOwners() {
      return Array.from(byEmail.values()).filter((a) => a.role === 'owner').length;
    },

    async upsert({ email, role, addedBy, at }) {
      const key = normaliseEmail(email);
      const existing = byEmail.get(key);
      byEmail.set(key, {
        ...(existing || { addedBy: addedBy || null, addedAt: at }),
        email: key,
        role
      });
      return clone(byEmail.get(key));
    },

    async setRole(email, role) {
      const admin = byEmail.get(normaliseEmail(email));
      if (!admin) return false;
      admin.role = role;
      return true;
    },

    async remove(email) {
      return byEmail.delete(normaliseEmail(email));
    },

    async recordLogin(email, { name, avatarUrl, at }) {
      const admin = byEmail.get(normaliseEmail(email));
      if (admin) {
        admin.lastLoginAt = at;
        admin.name = name || null;
        admin.avatarUrl = avatarUrl || null;
      }
    },

    async bootstrapOwner(email, at) {
      if (!normaliseEmail(email) || byEmail.size > 0) {
        return null;
      }
      byEmail.set(normaliseEmail(email), {
        email: normaliseEmail(email),
        role: 'owner',
        addedBy: 'bootstrap',
        addedAt: at
      });
      return clone(byEmail.get(normaliseEmail(email)));
    },

    _all() {
      return Array.from(byEmail.values()).map(clone);
    },
    _count() {
      return byEmail.size;
    }
  };
}

function createSessionStore() {
  const byHash = new Map();

  return {
    async create(record) {
      byHash.set(record.hash, { ...record });
      return clone(record);
    },
    async findByHash(hash) {
      return clone(byHash.get(hash)) || null;
    },
    async markReplaced(hash, replacedByHash, at) {
      const record = byHash.get(hash);
      if (record) {
        record.replacedByHash = replacedByHash;
        record.usedAt = at;
      }
    },
    async revoke(hash, at) {
      const record = byHash.get(hash);
      if (record) {
        record.revokedAt = at;
      }
    },
    async revokeFamily(familyId, at) {
      let n = 0;
      for (const record of byHash.values()) {
        if (record.familyId === familyId && !record.revokedAt) {
          record.revokedAt = at;
          n += 1;
        }
      }
      return n;
    },
    async revokeAllForUser(userId, at) {
      let n = 0;
      for (const record of byHash.values()) {
        if (record.userId === userId && !record.revokedAt) {
          record.revokedAt = at;
          n += 1;
        }
      }
      return n;
    },
    _all() {
      return Array.from(byHash.values()).map(clone);
    }
  };
}

function createStores(seedAdmins = []) {
  return { admins: createAdminStore(seedAdmins), adminSessions: createSessionStore() };
}

module.exports = { createStores, createAdminStore, createSessionStore };
