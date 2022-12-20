import * as alt from 'alt-client';
import * as natives from 'natives';
import { KeyHeld } from '@AthenaClient/events/keyHeld';
import Raycast from '@AthenaClient/utility/raycast';
import { FINGERPOINTING_CONFIG } from '@AthenaPlugins/athena-plugin-fingerpointing/shared/config';
import { loadAnimation } from '@AthenaClient/systems/animations';

let isFingerpointing: boolean = false;
let cleanStart: boolean = false;
let processingInterval: number;
let lastBlockedTime: number = null;

class FingerpointingInternal {
    static init() {
        KeyHeld.register(FINGERPOINTING_CONFIG.KEYBIND, FingerpointingInternal.start, FingerpointingInternal.stop);
    }

    static async start() {
        if (isFingerpointing) {
            return;
        }

        isFingerpointing = true;

        try {
            await loadAnimation('anim@mp_point');

            natives.setPedCurrentWeaponVisible(alt.Player.local.scriptID, false, true, true, true);
            natives.setPedConfigFlag(alt.Player.local.scriptID, 36, true);
            natives.taskMoveNetworkByName(
                alt.Player.local.scriptID,
                'task_mp_pointing',
                0.5,
                false,
                'anim@mp_point',
                24,
            );

            cleanStart = true;
            processingInterval = alt.setInterval(FingerpointingInternal.process, 10); // was 0 before
        } catch (e) {
            alt.log(e);
        }
    }

    static stop() {
        if (!isFingerpointing) {
            return;
        }

        if (processingInterval) {
            alt.clearInterval(processingInterval);
        }

        processingInterval = null;
        isFingerpointing = false;

        if (!cleanStart) {
            return;
        }

        cleanStart = false;

        natives.requestTaskMoveNetworkStateTransition(alt.Player.local.scriptID, 'Stop');

        if (!natives.isPedInjured(alt.Player.local.scriptID)) {
            natives.clearPedSecondaryTask(alt.Player.local.scriptID);
        }

        if (!alt.Player.local.vehicle) {
            natives.setPedCurrentWeaponVisible(alt.Player.local.scriptID, true, true, true, true);
        }

        natives.setPedConfigFlag(alt.Player.local.scriptID, 36, false);
        natives.clearPedSecondaryTask(alt.Player.local.scriptID);
    }

    static getRelativePitch() {
        const camRot = natives.getGameplayCamRot(2);

        return camRot.x - natives.getEntityPitch(alt.Player.local.scriptID);
    }

    static process() {
        if (!isFingerpointing) {
            return;
        }

        let camPitch = FingerpointingInternal.getRelativePitch();

        if (camPitch < -70) {
            camPitch = -70;
        } else if (camPitch > 42) {
            camPitch = 42;
        }

        camPitch = (camPitch + 75) / 112;

        let camHeading = natives.getGameplayCamRelativeHeading();

        if (camHeading < -180) {
            camHeading = -180;
        } else if (camHeading > 180) {
            camHeading = 180;
        }

        camHeading = (camHeading + 180) / 360;

        const raycast = Raycast.simpleRaycast(95, 0.2, true, 1);

        if (raycast.didHit && lastBlockedTime === null) {
            lastBlockedTime = Date.now();
        }

        natives.setTaskMoveNetworkSignalFloat(alt.Player.local.scriptID, 'Pitch', camPitch);
        natives.setTaskMoveNetworkSignalFloat(alt.Player.local.scriptID, 'Heading', camHeading * -1.0 + 1.0);

        // This is a debounce for isBlocked network signal to avoid flickering of the peds arm on fast raycast changes
        if (FingerpointingInternal.isBlockingAllowed()) {
            natives.setTaskMoveNetworkSignalBool(alt.Player.local.scriptID, 'isBlocked', raycast.didHit);
        }

        natives.setTaskMoveNetworkSignalBool(
            alt.Player.local.scriptID,
            'isFirstPerson',
            natives.getCamViewModeForContext(natives.getCamActiveViewModeContext()) === 4,
        );
    }

    static isBlockingAllowed() {
        const isAllowed = Date.now() - lastBlockedTime > FINGERPOINTING_CONFIG.DEBOUNCE_TIME;

        if (isAllowed) {
            lastBlockedTime = null;
        }

        return isAllowed;
    }
}

export class Fingerpointing {
    static init() {
        FingerpointingInternal.init();
    }
}
