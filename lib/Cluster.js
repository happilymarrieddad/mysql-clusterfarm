var EventEmitter = require('events').EventEmitter,
	Master = require('./Master'),
	Slave = require('./Slave')

module.exports = Cluster

function Cluster() {
	var vm = this

	EventEmitter.call(vm)
	vm.masters = []
	vm.num_masters = 0
	vm.last_master_used = 0

	vm.errors = {
		bad_sql:'Improperly formatted query string',
		bad_callback:'Must include a callback function as either the second or third argument \'function(err,rows)\'',
		bad_db_config:'Manager configuration must be included and must be an object. Please refer to documentation for more details'
	}
}

Cluster.prototype.query = function(sql,values,cb,options) {
	var vm = this,
		qry = null,
		callback = null,
		opts = null,
		type = 1

	if (typeof sql == 'string' && sql.length) {
		qry = sql
	} else {
		throw new Error(vm.errors.bad_sql)
	}

	if (typeof values == 'function') {
		callback = values
		if (typeof cb == 'object') {
			opts = cb
		}
	} else {
		if (typeof cb == 'function') {
			callback = cb
			opts = options || {}
		} else {
			throw new Error(vm.errors.bad_callback)
		}
		type = 2
	}

	vm.getAvailableMaster(function(index) {
		try {
			if (index > -1) {
				if (type == 1) {
					vm.masters[index].pool.query(qry,[],callback,opts)
				} else {
					vm.masters[index].pool.query(qry,values,callback,opts)
				}
			} else {
				callback('No active masters... Please ensure sql masters are live',null)
			}
		} catch(err) {
			console.log(vm.masters)
			console.log(vm.masters.length)
			console.log(err)
			console.log(index)
			try {
				if (type == 1) {
					vm.masters[0].pool.query(qry,[],callback,opts)
				} else {
					vm.masters[0].pool.query(qry,values,callback,opts)
				}
			}catch(err2) {
				callback('No active masters... Please ensure sql masters are live',null)
			}
		}
	})
}

Cluster.prototype.changeMasterData = function(sql,values,callback,options) {
	var vm = this

	function updateData(i) {
		if (i < vm.masters.length - 1) {
			vm.masters[i].pool.query(sql,values,function(){},options)
		} else {
			vm.masters[i].pool.query(sql,values,callback,options)
		}
	}	

	for (var i = 0; i < vm.masters.length; i++) {
		updateData(i)
	}
}

/**
 * Create a new Pool instance.
 * @return int master_index
 *		   -1 No good masters
 *			* Index of available master
 * @public
 */
Cluster.prototype.getAvailableMaster = function(callback) {
	var vm = this,
		num = this.masters.length,
		index = -1,
		running_index = this.last_master_used

	function finish() {
		if (!(--num)) { callback(index) }
	}

	for (var i = 0; i < vm.masters.length;i++) {
		vm.masters[running_index].isAvailable(function(is_available,master_index) {
			if (index == -1 && is_available) { 
				index = master_index
				vm.last_master_used = (master_index + 1) % (vm.masters.length) 
			}
			finish()
		})
		if (running_index >= vm.masters.length) { running_index = 0 }
	}
}

Cluster.prototype.addMaster = function(name,manager_config,query_config,callback) {
	var vm = this,
		new_master = {
			name:name,
			master_index:0,
			manager_config:manager_config,
			query_config:query_config || manager_config,
			slaves:[]
		}

	if (!manager_config || typeof manager_config != 'object') {
		throw new Error(this.errors.bad_manager_config)
	}
	if (!callback) { callback = function(){} }

	var master = new Master(new_master)
	master.setIndex(vm.masters.length)
	master.init(vm,function() {
		vm.masters.push(master)
		vm.num_masters = vm.masters.length
		callback()
	})
}

Cluster.prototype.addSlave = function(name,master_name,manager_config,query_config,callback) {
	var vm = this,
		master_index = -1,
		new_slave = {
			name:name,
			manager_config:manager_config,
			query_config:query_config || manager_config
		}

	if (!manager_config || typeof manager_config != 'object') {
		throw new Error(this.errors.bad_db_config)
	}
	if (!callback) { callback = function(){} }

	for (var i = 0; i < vm.masters.length; i++) {
		if (master_name == vm.masters[i].name) {
			master_index = i
		}
	}

	if (master_index > -1) {
		var slave = new Slave(new_slave)
		vm.masters[master_index].addSlave(slave,function() {
			callback()
		})
	} else {
		throw new Error('Master ' + master_name + ' not found.')
	}
}