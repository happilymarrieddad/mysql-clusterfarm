# mysql-clusterfarm

[![NPM Version][mysql-url]]

## Table of Contents

- [News](#news)
- [Introduction](#introduction)
- [Install](#install)
- [Setting Up Databases](#setting-up-databases)
- [Basic Usage](#basic-usage)
- [MySQL Load File](#mysql-load-file)

## News
WARNING!!! This package is in HEAVY DEVELOPMENT and is NOT READY FOR PRODUCTION USE!!!!

## Introduction

Welcome to the MySQL Clustered package. This package will allow you to hook up multiple Mysql hosts with minimal configuration on your part. It will handle all the complication associated with clustering large MySQL farms.  
  
This package relies HEAVILY on the mysql node package. It has been modified to handle mysql replication and clustering. I did not write any of that code. Please refer to https://www.npmjs.com/package/mysql for licensing.

## Install
Run this on every application instance that is going to use the cluster  
``` sh
$ npm install mysql-clusterfarm
```

Check the 'Basic Usage' for information on how to add servers to the cluster

 All you have to do is the following
 ``` sh
 cluster.query('SELECT some_column FROM some_table',function(err,rows) {  })
 ```


## Setting Up Databases
(This assumes AWS ubuntu servers, adjust accordingly)  
http://dev.mysql.com/doc/refman/5.7/en/replication-howto.html  
  
Setting up binlogs  
  
On master server  
``` sh
$ sudo su
$ emacs /etc/mysql/my.cnf
```
Set each master's server_id variable with a unique id. I like to set them up as 100's so for example I would set the first master server up as 100 and then the second one as 200
Here's an example of what I do on our production servers but you can feel free to change it up as needed  
``` sh
server-id                 		= 100
log_bin 						= /supersecret/path/to/binlogs
expire_log_days 				= 1
max_binlog_size 				= 100M
binlog_do_db					= supersecretnameofdatabase
innodb_flush_log_at_trx_commit	= 1 
sync_bin_log					= 1
```
uneeded but I suggest you at least increase these values somewhat  
``` sh
wait_timeout             = 28800
innodb_lock_wait_timeout = 28800
connect_timeout          = 28800
net_read_timeout         = 28800
net_write_timeout        = 28800
slave_net_timeout        = 28800
max_connections        	 = 100000
max_connect_errors     	 = 1000000
```
save,exit,restart mysql  
``` sh
$ service mysql restart
```
  
On slave  
``` sh
$ sudo su
$ emacs /etc/mysql/my.cnf
```

``` sh
server-id = 101
```
  
save,exit,restart mysql  
``` sh
$ service mysql restart
```
  
Create a user inside mysql to query off of and one to replicate off of (PLEASE adjust the IP's for the user. It is just an example.)  
``` sh
CREATE USER 'someuser'@'172.%' IDENTIFIED BY 'terriblepassword';
GRANT ALL ON *.* TO 'someuser'@'172.%';
CREATE USER 'repl'@'172.%' IDENTIFIED BY 'terriblepassword';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'172.%';
FLUSH PRIVILEGES;
```
  
Lock the tables on the master databases  
Dump the databases and load the script into the slaves  
Unlock the tables and start slaves  

On the master server  
```sh
FLUSH TABLES WITH READ LOCK;
SHOW MASTER STATUS;
```

write down/memorize/or keep this open in a terminal somewhere  
Use whatever tool you want to get the scripts from the master database to all other databases (I just use MySQL workbench)  
  
On the slave  
``` sh
CHANGE MASTER TO 
MASTER_HOST='master_host_name',
MASTER_USER='replication_user_name',
MASTER_PASSWORD='replication_password',
MASTER_LOG_FILE='recorded_log_file_name',
MASTER_LOG_POS=recorded_log_position;
START SLAVE;
SHOW SLAVE STATUS;   // Use this to make sure the slave is activily changing based on the master
```
  
On the master server  
```sh
UNLOCK TABLES;
```
  
I would suggest at this point to go change something on the master and check the slave to make sure it migrated to the slave.  
  
If everything went well you now have a clustered system!  
  
## Basic Usage
  
You don't have to use async but be aware that if you don't it's possible for query to be called before the system is fully initialized.  
The configuration variables are the same as node-mysql createPool(). https://www.npmjs.com/package/mysql#pool-options
  
``` sh
var async = require('async'),
	cluster = require('mysql-clusterfarm').createCluster()

async.series([
	function(cb) {
		cluster.addMaster(
			'MASTER1', {
				host:'someip1',
				user:'root',
				password:'password',
				database:'test_db'
			}, {
				host:'someip1',
				user:'query_user',
				password:'password',
				database:'test_db'
			},cb
		)
	},
	function(cb) {
		cluster.addMaster(
			'MASTER2', {
				host:'someip2',
				user:'root',
				password:'password',
				database:'test_db'
			}, {
				host:'someip2',
				user:'query_user',
				password:'password',
				database:'test_db'
			},cb
		)
	},
	function(cb) {
		cluster.addSlave(
			'SLAVE1',
			'MASTER1', {
				host:'someip3',
				user:'root',
				password:'password',
				database:'test_db'
			}, {
				host:'someip3',
				user:'query_user',
				password:'password',
				database:'test_db'
			},cb
		)
	},
	function(cb) {
		cluster.addSlave(
			'SLAVE2',
			'MASTER1', {
				host:'someip4',
				user:'root',
				password:'password',
				database:'test_db'
			}, {
				host:'someip4',
				user:'query_user',
				password:'password',
				database:'test_db'
			},cb
		)
	},
	function(cb) {
		cluster.addSlave(
			'SLAVE3',
			'MASTER2', {
				host:'someip3',
				user:'root',
				password:'password',
				database:'test_db'
			}, {
				host:'someip3',
				user:'query_user',
				password:'password',
				database:'test_db'
			},cb
		)
	},
	function(cb) {
		cluster.addSlave(
			'SLAVE4',
			'MASTER2', {
				host:'someip4',
				user:'root',
				password:'password',
				database:'test_db'
			}, {
				host:'someip4',
				user:'query_user',
				password:'password',
				database:'test_db'
			},cb
		)
	}
],function() {
	// Use the cluster to create an awesome app!
	// cluster.query('SELECT some_column FROM some_table',function(err,rows) {  })
})
```
## MySQL Load File
  
If you are interested in storing file into the database, you need to follow these instructions.  
MySQL's LOAD_FILE will only look for the file locally. We solve this problem by storing the file  
locally on the MySQL master server and load it after it's been posted.  