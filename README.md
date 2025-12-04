# Proxmox MCP Server

Model Context Protocol (MCP) server for Proxmox Virtual Environment management. Provides 35 comprehensive tools for managing VMs, containers, storage, backups, and cluster operations through the Proxmox VE API.

## Features

### Cluster & Node Management (4 tools)
- `pve_get_cluster_status` - Get Proxmox cluster status and health
- `pve_list_nodes` - List all nodes in the cluster
- `pve_get_node_status` - Get detailed status of a specific node
- `pve_get_node_resources` - Get CPU, memory, and storage usage for a node

### Virtual Machine Management (11 tools)
- `pve_list_vms` - List all VMs across the cluster or on a specific node
- `pve_get_vm_status` - Get detailed status of a specific VM
- `pve_get_vm_config` - Get configuration of a specific VM
- `pve_start_vm` - Start a VM
- `pve_stop_vm` - Stop a VM (graceful shutdown or forced)
- `pve_reboot_vm` - Reboot a VM
- `pve_suspend_vm` - Suspend a VM
- `pve_resume_vm` - Resume a suspended VM
- `pve_clone_vm` - Clone a VM (full or linked)
- `pve_delete_vm` - Delete a VM (use with caution!)
- `pve_migrate_vm` - Migrate VM to another node (live or offline)

### Container (LXC) Management (4 tools)
- `pve_list_containers` - List all LXC containers
- `pve_get_container_status` - Get status of a container
- `pve_start_container` - Start a container
- `pve_stop_container` - Stop a container

### Storage Management (2 tools)
- `pve_list_storage` - List all storage pools
- `pve_get_storage_content` - List content of a storage pool (images, ISOs, backups, etc.)

### Backup Management (2 tools)
- `pve_list_backups` - List backups for a VM or container
- `pve_create_backup` - Create a backup of a VM or container

### Snapshot Management (4 tools)
- `pve_list_snapshots` - List snapshots of a VM
- `pve_create_snapshot` - Create a snapshot of a VM
- `pve_rollback_snapshot` - Rollback VM to a snapshot
- `pve_delete_snapshot` - Delete a snapshot

### Task Management (2 tools)
- `pve_list_tasks` - List recent tasks on a node
- `pve_get_task_status` - Get status of a specific task

### Network Management (1 tool)
- `pve_list_networks` - List network interfaces on a node

### Terraform Integration (2 tools)
- `pve_generate_terraform` - Generate Terraform configuration for a VM
- `pve_generate_terraform_provider` - Generate Terraform provider configuration for the cluster

## Installation

```bash
npm install
npm run build
```

## Configuration

The server requires Proxmox VE API credentials configured via environment variables. Two authentication methods are supported:

### API Token Authentication (Recommended)

```bash
export PROXMOX_URL="https://your-proxmox-host:8006"
export PROXMOX_USER="root@pam"
export PROXMOX_TOKEN_ID="your-token-id"
export PROXMOX_TOKEN_SECRET="your-token-secret"
```

To create an API token in Proxmox:
1. Log into Proxmox web UI
2. Go to Datacenter > Permissions > API Tokens
3. Click "Add" to create a new token
4. Uncheck "Privilege Separation" for full access
5. Save the token ID and secret

### Password Authentication (Alternative)

```bash
export PROXMOX_URL="https://your-proxmox-host:8006"
export PROXMOX_USER="root@pam"
export PROXMOX_PASSWORD="your-password"
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "proxmox": {
      "command": "node",
      "args": ["/path/to/mcp-proxmox/dist/index.js"],
      "env": {
        "PROXMOX_URL": "https://your-proxmox-host:8006",
        "PROXMOX_USER": "root@pam",
        "PROXMOX_TOKEN_ID": "your-token-id",
        "PROXMOX_TOKEN_SECRET": "your-token-secret"
      }
    }
  }
}
```

## Development

Run in development mode with hot reload:

```bash
npm run dev
```

## Security Notes

- The server accepts self-signed SSL certificates by default (common for Proxmox installations)
- For production use, consider using properly signed certificates
- API tokens are more secure than password authentication
- Ensure proper access controls on the Proxmox user/token

## Example Use Cases

1. **VM Lifecycle Management**: Start, stop, reboot VMs across your cluster
2. **Resource Monitoring**: Check CPU, memory, storage usage on nodes
3. **Backup Operations**: Create and manage VM/container backups
4. **Snapshot Management**: Create snapshots before changes, rollback if needed
5. **Live Migration**: Move VMs between nodes for maintenance
6. **Infrastructure as Code**: Export VM configurations as Terraform

## API Reference

All tools return JSON responses from the Proxmox API. The server handles authentication, error handling, and response formatting automatically.

For detailed Proxmox API documentation, see: https://pve.proxmox.com/pve-docs/api-viewer/

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
