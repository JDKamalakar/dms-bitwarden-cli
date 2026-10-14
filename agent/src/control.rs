//! Strict, bounded panel-to-companion control messages.

use crate::approvals::GrantDuration;
use serde::Deserialize;

pub const CONTROL_VERSION: u8 = 2;
pub const MAX_CONTROL_LINE: usize = 64 * 1024;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum ControlMessage {
    Hello {
        v: u8,
    },
    KeyLoadBegin {
        v: u8,
        epoch: u64,
        #[serde(rename = "loadId")]
        load_id: String,
    },
    KeyLoadEnd {
        v: u8,
        epoch: u64,
        status: LoadStatus,
    },
    VaultLocked {
        v: u8,
        epoch: u64,
    },
    VaultLoggedOut {
        v: u8,
    },
    #[serde(deserialize_with = "deserialize_approval")]
    Approve {
        v: u8,
        request_id: u64,
        duration: GrantDuration,
    },
    Deny {
        v: u8,
        #[serde(rename = "requestId")]
        request_id: u64,
    },
    UnlockCancelled {
        v: u8,
        #[serde(rename = "requestId")]
        request_id: u64,
        reason: String,
    },
    /// Panel settings the companion needs to act on. Sent after the
    /// handshake and whenever they change.
    Options {
        v: u8,
        #[serde(rename = "unlockOnDemand")]
        unlock_on_demand: bool,
    },
    RevokeGrants {
        v: u8,
    },
    RevokeGrant {
        v: u8,
        #[serde(rename = "grantId")]
        grant_id: u64,
    },
    Shutdown {
        v: u8,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LoadStatus {
    Ok,
    Failed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ControlError {
    Empty,
    TooLong,
    Malformed,
    WrongVersion,
}

impl ControlMessage {
    pub fn version(&self) -> u8 {
        match self {
            Self::Hello { v }
            | Self::VaultLoggedOut { v }
            | Self::RevokeGrants { v }
            | Self::Shutdown { v } => *v,
            Self::KeyLoadBegin { v, .. }
            | Self::Options { v, .. }
            | Self::RevokeGrant { v, .. }
            | Self::KeyLoadEnd { v, .. }
            | Self::VaultLocked { v, .. }
            | Self::Approve { v, .. }
            | Self::Deny { v, .. }
            | Self::UnlockCancelled { v, .. } => *v,
        }
    }
}

pub fn parse_control_line(line: &[u8]) -> Result<ControlMessage, ControlError> {
    let line = line.strip_suffix(b"\n").unwrap_or(line);
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    if line.is_empty() {
        return Err(ControlError::Empty);
    }
    if line.len() > MAX_CONTROL_LINE {
        return Err(ControlError::TooLong);
    }
    #[derive(Deserialize)]
    struct Version {
        v: u8,
    }
    let version: Version = serde_json::from_slice(line).map_err(|_| ControlError::Malformed)?;
    if version.v != CONTROL_VERSION {
        return Err(ControlError::WrongVersion);
    }
    serde_json::from_slice(line).map_err(|_| ControlError::Malformed)
}

fn deserialize_approval<'de, D>(deserializer: D) -> Result<(u8, u64, GrantDuration), D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct ApprovalInput {
        v: u8,
        #[serde(rename = "requestId")]
        request_id: u64,
        #[serde(rename = "grantSeconds")]
        grant_seconds: u64,
        #[serde(default, rename = "untilScreenLock")]
        until_screen_lock: bool,
    }
    let input = ApprovalInput::deserialize(deserializer)?;
    let duration = match (input.grant_seconds, input.until_screen_lock) {
        (0, true) => GrantDuration::UntilScreenLock,
        (_, true) => return Err(serde::de::Error::custom("conflicting approval durations")),
        (0, false) => GrantDuration::Once,
        (seconds, false) => GrantDuration::Seconds(seconds),
    };
    Ok((input.v, input.request_id, duration))
}
