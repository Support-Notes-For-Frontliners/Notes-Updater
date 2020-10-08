/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const ALL_DATA_LOC = "aggData";
const CHILD_DATA_LOC = "formData";
const LOC_DATA_LOC = "locationData";
const STATS_DATA_LOC = "statsData";

// Gets the snapshot's child value for different viewpoints (user and root)
function getCommonRef(ref, child, value) {
	return ref.child(child).child(value);
}
function getRefConvert(ref, uid, statRef, children) {
	ref = ref.root;
	if (statRef) {
		return ref.child(STATS_DATA_LOC).child(uid).child(children);
	} else {
		return ref.child(ALL_DATA_LOC).child(uid).child(children);
	}
}

// Keeps track of the length of the 'notes' child list in a separate property.
exports.countnotes = functions.database
	.ref(`/${ALL_DATA_LOC}/{uid}/${CHILD_DATA_LOC}/{note}`)
	.onWrite(async (snap, context) => {
		const change = snap;
		snap = snap.after;
		context.params.uid;
		const countRefUser = getRefConvert(
			snap.ref,
			context.params.uid,
			true,
			"notes_count"
		);
		const countRefRoot = getCommonRef(snap.ref.root, "stats", "notes_count");

		let increment = 1;
		// Return the promise from countRef.transaction() so our function
		// waits for this async event to complete before it exits.
		if (change.after.exists() && !change.before.exists()) {
			increment = 1;
		} else if (!change.after.exists() && change.before.exists()) {
			increment = -1;
		} else {
			return null;
		}
		await countRefUser.transaction((current) => {
			return (current || 0) + increment;
		});
		await countRefRoot.transaction((current) => {
			return (current || 0) + increment;
		});
		console.log(`increment ${increment}`);
		return null;
	});

exports.recountmaster = functions.database
	.ref(`/stats/{type}`)
	.onWrite(async (snap, context) => {
		if (!snap.after.exists()) {
			const ref = snap.after.ref;
			const type = context.params.type;
			const statsData = (
				await ref.root.child(STATS_DATA_LOC).once("value")
			).val();
			var total = 0;
			await Object.keys(statsData).map((val) => {
				try {
					total += statsData[val][type];
				} catch (error) {
					total;
				}
				return null;
			});
			ref.set(total);
		}
	});

// If the number of likes gets deleted, recount the number of likes
exports.recountparam = functions.database
	.ref(`/${STATS_DATA_LOC}/{uid}/{type}`)
	.onWrite(async (snap, context) => {
		if (!snap.after.exists()) {
			const ref = snap.after.ref;
			const counterRef = getRefConvert(
				ref,
				context.params.uid,
				true,
				context.params.type
			);
			const countRefRoot = getCommonRef(ref.root, "stats", context.params.type);
			var prev = await snap.before.val();
			var dataRef = null;
			var total_facility = 0;
			switch (context.params.type) {
				case "facility_count":
					dataRef = await getRefConvert(
						ref,
						context.params.uid,
						false,
						LOC_DATA_LOC
					).child("locations");
					dataRef
						.once("value")
						.then((data) => {
							const stor = data.val();
							total_facility = 0;
							Object.keys(stor).map((k) => {
								total_facility += stor[k].length;
								return null;
							});
							return null;
						})
						.catch(() => {
							return null;
						});
					break;
				case "notes_count":
					dataRef = await getRefConvert(
						ref,
						context.params.uid,
						false,
						CHILD_DATA_LOC
					);
					break;
				case "sent_count":
					dataRef = await getRefConvert(
						ref,
						context.params.uid,
						false,
						CHILD_DATA_LOC
					)
						.orderByChild("sent")
						.equalTo(true);
					break;
			}

			// Recount the given value.
			if (dataRef !== null) {
				if (!(context.params.type === "facility_count")) {
					const messagesData = await dataRef.once("value");
					const val = await messagesData.numChildren();
					await counterRef.set(val === null ? 0 : val);
					await countRefRoot.transaction((current) => {
						return (current || 0) + (val - prev);
					});
				} else {
					await countRefRoot.transaction((current) => {
						return (current || 0) + (total_facility - prev);
					});
					await counterRef.set(total_facility === null ? 0 : total_facility);
				}
			}
		}
		// else {
		// 	const bef = await snap.before.val();
		// 	const after = snap.after.val();
		// 	if (after !== bef) {
		// 		snap.after.ref.set(bef);
		// 	}
		// }
		return null;
	});

exports.sentCreate = functions.database
	.ref(`/${ALL_DATA_LOC}/{uid}/${CHILD_DATA_LOC}/{note}/sent`)
	.onWrite(async (snap, context) => {
		const change = snap;
		snap = snap.after;
		const countRefUser = getRefConvert(
			snap.ref,
			context.params.uid,
			true,
			"sent_count"
		);
		const countRefRoot = getCommonRef(snap.ref.root, "stats", "sent_count");

		let increment = 1;
		// Return the promise from countRef.transaction() so our function
		// waits for this async event to complete before it exits.
		const before = await change.before.val();
		const after = await change.after.val();
		if (change.after.exists() && !change.before.exists() && after) {
			increment = 1;
		} else if (!change.after.exists() && change.before.exists() && before) {
			increment = -1;
		} else if (change.after.exists() && change.before.exists()) {
			if (!before && after) {
				increment = 1;
			} else if (!after && before) {
				increment = -1;
			}
		} else {
			return null;
		}
		await countRefUser.transaction((current) => {
			return (current || 0) + increment;
		});
		await countRefRoot.transaction((current) => {
			return (current || 0) + increment;
		});
		console.log(`sent ${increment}, ${before}, ${after}`);
		return null;
	});
