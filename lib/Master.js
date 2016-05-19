var EventEmitter = require('events').EventEmitter,
	async = require('async'),
	request = require('request'),
	fs = require('fs'),
	poolConnection = require('./Pool'),
	poolConnectionConfig = require('./PoolConfig')

module.exports = Master

function Master(new_master) {
	var vm = this
	EventEmitter.call(vm)
	vm.index = -1
	vm.cluster = null
	vm.active = true
	vm.name = new_master.name
	vm.master_index = new_master.master_index
	vm.manager_config = new_master.manager_config
	vm.query_config = new_master.query_config || new_master.manager_config
	vm.pool = new poolConnection({config: new poolConnectionConfig(new_master.manager_config) })
	vm.slaves = new_master.slaves
	vm.num_slaves = (vm.slaves ? vm.slaves.length : 0)
	vm.last_slave_used = -1
}

Master.prototype.setIndex = function(index) {
	this.index = index
}

// This function will handle all the replication stuff
Master.prototype.init = function(cluster,callback) {
	this.cluster = cluster
	callback()
}

Master.prototype.isAvailable = function(callback) {
	var vm = this
	callback(vm.active,vm.index)
}

Master.prototype.adjustLastSlaveUsed = function() {
	var vm = this
	if (vm.slaves.length > 0) {
		if (vm.last_slave_used < vm.slaves.length - 1) {
			vm.last_slave_used += 1
		} else {
			vm.last_slave_used = -1
		}
	} else {
		vm.last_slave_used = -1
	}
}

Master.prototype.query = function(sql,values,callback,options) {
	var vm = this

	try {

		var type = sql.split(' ')[0].toUpperCase()

		function finish() {

			//console.log('Querying from',vm.name,'number',vm.last_slave_used)
			if (type == 'SELECT' && vm.slaves.length > 0) {
				if (vm.last_slave_used < 0) {
					vm.pool.query(sql,values,callback)
				} else {
					vm.slaves[vm.last_slave_used].pool.query(sql,values,callback)
				}
				vm.adjustLastSlaveUsed()
			} else {
				vm.cluster.changeMasterData(sql,values,callback,options)
			}

		}
		var load_file_index = sql.indexOf('LOAD_FILE')
		if (load_file_index < 0) { sql.indexOf('load_file') }

		var start_load_file = sql.indexOf('(',load_file_index),
			end_load_file = sql.indexOf(')',start_load_file),
			filepath = sql.substr(start_load_file + 2, ( ( end_load_file - 1 ) - start_load_file - 2) ),
			filearray = filepath.split('/'),
			filename = filearray[filearray.length-1]

		if ((options && options.load_file) || load_file_index > -1) {

			var rs = fs.createReadStream(filepath)
				.on('error',function(err) {
					console.log('Unable to post file to mysql server... ERROR: ',err)
				})
				.on('end',function() {
					console.log('Piped',filename,'file to',vm.master_config.host,vm.master_config.file_post_port)
					setTimeout(function() {
						finish()
					},5000)//(vm.master_config.file_post_timeout || 2000))
				})
				.pipe(
					request.post('http://' + vm.master_config.host + ':' + (vm.master_config.file_post_port || 8080) + '/mysql/' + filename )
				)

			function pipeToOtherServers(i) {

				var rs = fs.createReadStream(filepath)
					.on('error',function(err) {
						console.log('Unable to post file to mysql server... ERROR: ',err)
					})
					.on('end',function() {
						console.log('Piped',filename,'file to',vm.cluster.masters[i].master_config.host,vm.cluster.masters[i].master_config.file_post_port)
					})
					.pipe(
						request.post('http://' + vm.cluster.masters[i].master_config.host + ':' + (vm.cluster.masters[i].master_config.file_post_port || 8080) + '/mysql/' + filename )
					)
			}

			for (var i = 0; i < vm.cluster.masters.length; i++) {
				if (vm.cluster.masters[i].index != vm.index) {
					pipeToOtherServers(i)
				}
			}

		} else {
			finish()
		}

	} catch(err) {
		throw new Error(err)
	}
}

Master.prototype.addSlave = function(slave,callback) {
	var vm = this

	slave.init(vm,function() {
		slave.setIndex(vm.slaves.length)
		vm.slaves.push(slave)
		vm.num_slaves = vm.slaves.length
		callback()
	})
} 