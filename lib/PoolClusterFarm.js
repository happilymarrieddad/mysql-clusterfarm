var Pool          = require('./Pool');
var PoolConfig    = require('./PoolConfig');
var PoolNamespace = require('./PoolNamespace');
var PoolSelector  = require('./PoolSelector');
var Util          = require('util');
var EventEmitter  = require('events').EventEmitter;
var proxyMysqlDeadlockRetries = require('node-mysql-deadlock-retries')

/**
 * PoolClusterFarm
 * @constructor
 * @param {object} [config] The pool cluster farm configuration
 * @public
 */
function PoolClusterFarm(config) {
  EventEmitter.call(this);

  this.config = config || {};
  this._servers = [];
  this._numMasters = 0;
  this._numSlaves = 0;
  this._next_index = 0;
  this._next_slave_index = 0;
  this.debug = this.config.debug || false
  this.useDeadlockHandling = this.config.useDeadlockHandling || false
  this.deadlockConfig = {
  	retries:5,
  	minMillis:1,
  	maxMillis:100
  }
  if (this.config.deadlockConfig) {
  	for (var key in this.deadlockConfig) {
  		if (this.config.deadlockConfig.hasOwnProperty(key)) {
  			this.deadlockConfig[key] = this.config.deadlockConfig[key]
  		}
  	}
  }
}

var isFunction = function(func) {
	return func && typeof func == 'function'
}

Util.inherits(PoolClusterFarm,EventEmitter);

PoolClusterFarm.prototype.escape = function(value) {
  return this._servers[0].pool.escape(value)
};

PoolClusterFarm.prototype.query = function query(sql,values,cb) {
	var self = this

	if (!self._numMasters || self._numMasters < 1) {
		throw new Error('No servers assigned to PoolClusterFarm. Please verify...')
	}

	if (typeof sql != 'string') {
		console.log(sql)
		console.log(values)
		throw new Error('Invalid sql statement. Please verify...')
	}

	if (sql.match(/select/i) || sql.match(/call/i)) {
		var index_to_use = self._next_index
		var index_slave_to_use = self._next_slave_index

		if (self._servers && self._servers[index_to_use] && self._servers[index_to_use].slaves && self._servers[index_to_use].slaves[index_slave_to_use+1]) {
			self._next_slave_index += 1
		} else {
			self._next_slave_index = 0
			if (self._servers && self._servers[index_to_use+1]) {
				self._next_index += 1
			} else {
				self._next_index = 0
			}
		}

		if (!self._servers[index_to_use].slaves.length) {
			if (self.debug) { console.log('Using master',self._servers[index_to_use].id) }
			self._servers[index_to_use].pool.query(sql,values,cb);
		} else {
			if (self.debug) { console.log('Using slave',self._servers[index_to_use].slaves[index_slave_to_use].id,'of master',self._servers[index_to_use].id) }
			self._servers[index_to_use].slaves[index_slave_to_use].pool.query(sql,values,cb);
		}

	} else {
		var num = self._numMasters;
		var error_encountered = false

		var updateMasters = function(i) {
			if (error_encountered) { return }
			self._servers[i].pool.query(sql,values,function(err,rows) {
				if (error_encountered) { return }
				if (err) {
					error_encountered = true
					if (isFunction(cb)) { return cb(err,rows); }
					else if (values && typeof values == 'function') { return values(err,rows); }
				}
				if (!(--num)) {
					if (isFunction(cb)) { return cb(err,rows); }
					else if (values && typeof values == 'function') { return values(err,rows); }
				}
			});
		}

		for (var i = 0; i < self._servers.length; i++) {
			updateMasters(i);
		}

	}
}

PoolClusterFarm.prototype.addMaster = function(id,config,respond) {
	var self = this
	if (!respond || typeof respond != 'function') { respond = function(err){ throw new Error(err) }; }
	var server_name = typeof id == 'string' ? id : self._makeId();
	var server_config = {};
	if (config && typeof config == 'object') {
		server_config = config;
	} else if (id && typeof id == 'object') {
		server_config = id;
	} else {
		throw new Error('No server configuration passed in. Please look at the documentation.');
	}
	var poolConfig = new PoolConfig(server_config)
	var pool = new Pool({config:poolConfig})
	pool.on('connection',function(connection) {
		if (self.useDeadlockHandling) {
			proxyMysqlDeadlockRetries(connection,self.deadlockConfig.retries,self.deadlockConfig.minMillis,self.deadlockConfig.maxMillis)
		}
	})
	self._servers.push({
		id:server_name,
		pool:pool,
		online:1,
		slaves:[]
	})
	self._calculateNumServers()
}

PoolClusterFarm.prototype.addSlave = function(id,master,config,respond) {
	var self = this
	if (!respond || typeof respond != 'function') { respond = function(err){ throw new Error(err) }; }
	var server_name = typeof id == 'string' ? id : self._makeId();
	var server_master_id = master;
	var server_config = {};
	if (config && typeof config == 'object') {
		server_config = config;
	} else if (id && typeof id == 'object') {
		server_config = id;
	} else {
		throw new Error('No server configuration passed in. Please look at the documentation.');
	}
	var poolConfig = new PoolConfig(server_config)
	var found = self._servers.findIndex(function(element) {
		return element.id == server_master_id
	})
	if (isNaN(+found) || +found < 0) {
		throw new Error('Master server ' + server_master_id +' not found')
	}
	var pool = new Pool({config:poolConfig})
	pool.on('connection',function(connection) {
		if (self.useDeadlockHandling) {
			proxyMysqlDeadlockRetries(connection,self.deadlockConfig.retries,self.deadlockConfig.minMillis,self.deadlockConfig.maxMillis)
		}
	})
	self._servers[found].slaves.push({
		id:server_name,
		master_id:server_master_id,
		pool:pool,
		online:1
	})
	self._calculateNumServers()
}

PoolClusterFarm.prototype._makeId = function _makeId() {
	return Math.random().toString(36).substring(5);
}

PoolClusterFarm.prototype._calculateNumServers = function _calculateNumServers() {
	this._numMasters = this._servers.length;
	this._numSlaves = 0;
	for (var i = 0; i < this._servers.length; i++) {
		this._numSlaves += +this._servers[i].slaves.length
	}
}

module.exports = PoolClusterFarm;