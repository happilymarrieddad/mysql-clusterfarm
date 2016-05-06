var EventEmitter = require('events').EventEmitter,
	async = require('async'),
	poolConnection = require('./Pool'),
	poolConnectionConfig = require('./PoolConfig')

module.exports = Slave

function Slave(new_slave) {
	var vm = this
	EventEmitter.call(vm)
	vm.index = -1
	vm.name = new_slave.name
	vm.manager_config = new_slave.manager_config
	vm.query_config = new_slave.query_config
	vm.pool = new poolConnection({config: new poolConnectionConfig(new_slave.query_config)})
}

Slave.prototype.setIndex = function(index) {
	this.index = index
}

Slave.prototype.init = function(master,callback) {
	this.master = master
	callback()
}