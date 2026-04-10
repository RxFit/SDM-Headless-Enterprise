#!/usr/bin/env pwsh
<#
.SYNOPSIS
Provisions GCP Pub/Sub topics and subscriptions for the Sovereign Domain Mesh.

.DESCRIPTION
Creates 3 topics (jade-commands, antigravity-tasks, scarlet-tasks) with
subscriptions for each orchestrator. Also creates a service account with
Pub/Sub-only permissions and downloads the key.

.NOTES
Run: gcloud auth login    (if reauthentication needed)
Then: .\provision_pubsub.ps1 -ProjectId YOUR_PROJECT_ID
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId
)

$ErrorActionPreference = "Stop"

Write-Host "═" * 60
Write-Host "  SOVEREIGN DOMAIN MESH — Pub/Sub Provisioning"
Write-Host "═" * 60
Write-Host ""

# Set the project
Write-Host "[1/7] Setting GCP project to: $ProjectId"
gcloud config set project $ProjectId 2>&1

# Enable Pub/Sub API
Write-Host "[2/7] Enabling Pub/Sub API..."
gcloud services enable pubsub.googleapis.com 2>&1

# Create topics
$topics = @("jade-commands", "antigravity-tasks", "scarlet-tasks")
Write-Host "[3/7] Creating topics..."
foreach ($topic in $topics) {
    $existing = gcloud pubsub topics list --filter="name:$topic" --format="value(name)" 2>&1
    if ($existing -match $topic) {
        Write-Host "  [SKIP] Topic '$topic' already exists"
    } else {
        gcloud pubsub topics create $topic 2>&1
        Write-Host "  [OK] Created topic: $topic"
    }
}

# Create subscriptions (one per orchestrator per topic)
Write-Host "[4/7] Creating subscriptions..."

# Jade subscribes to jade-commands
gcloud pubsub subscriptions create jade-sub --topic=jade-commands --ack-deadline=60 --message-retention-duration=7d 2>&1
Write-Host "  [OK] jade-sub → jade-commands"

# Antigravity subscribes to antigravity-tasks
gcloud pubsub subscriptions create antigravity-sub --topic=antigravity-tasks --ack-deadline=60 --message-retention-duration=7d 2>&1
Write-Host "  [OK] antigravity-sub → antigravity-tasks"

# Scarlet Kepler subscribes to scarlet-tasks
gcloud pubsub subscriptions create scarlet-sub --topic=scarlet-tasks --ack-deadline=60 --message-retention-duration=7d 2>&1
Write-Host "  [OK] scarlet-sub → scarlet-tasks"

# Dead Letter Topics (one per orchestrator)
Write-Host "[5/7] Creating Dead Letter Topics..."
foreach ($topic in $topics) {
    $dlqTopic = "$topic-dlq"
    $existing = gcloud pubsub topics list --filter="name:$dlqTopic" --format="value(name)" 2>&1
    if ($existing -match $dlqTopic) {
        Write-Host "  [SKIP] DLQ '$dlqTopic' already exists"
    } else {
        gcloud pubsub topics create $dlqTopic 2>&1
        Write-Host "  [OK] Created DLQ: $dlqTopic"
    }
}

# Create service account for worker nodes (Pub/Sub only)
Write-Host "[6/7] Creating service account..."
$saName = "sdm-node-pubsub"
$saEmail = "$saName@$ProjectId.iam.gserviceaccount.com"

$existingSA = gcloud iam service-accounts list --filter="email:$saEmail" --format="value(email)" 2>&1
if ($existingSA -match $saEmail) {
    Write-Host "  [SKIP] Service account '$saEmail' already exists"
} else {
    gcloud iam service-accounts create $saName --display-name="SDM Worker Node Pub/Sub" 2>&1
    Write-Host "  [OK] Created service account: $saEmail"
}

# Grant Pub/Sub Publisher + Subscriber roles
gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$saEmail" --role="roles/pubsub.publisher" --quiet 2>&1
gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$saEmail" --role="roles/pubsub.subscriber" --quiet 2>&1
Write-Host "  [OK] Granted pubsub.publisher + pubsub.subscriber"

# Download service account key
$keyPath = Join-Path $PSScriptRoot "anc-mcp-core" "gcp-sa-key.json"
Write-Host "[7/7] Downloading service account key to: $keyPath"
gcloud iam service-accounts keys create $keyPath --iam-account=$saEmail 2>&1
Write-Host "  [OK] Key saved"

Write-Host ""
Write-Host "═" * 60
Write-Host "  PROVISIONING COMPLETE"
Write-Host "═" * 60
Write-Host ""
Write-Host "Update your .env with:"
Write-Host "  GCP_PROJECT_ID=$ProjectId"
Write-Host "  GOOGLE_APPLICATION_CREDENTIALS=./gcp-sa-key.json"
Write-Host ""
Write-Host "Topics: $($topics -join ', ')"
Write-Host "DLQs:   $($topics | ForEach-Object { "$_-dlq" }) "
Write-Host "SA:     $saEmail"
