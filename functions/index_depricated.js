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
admin.initializeApp();

// Keeps track of the length of the 'likes' child list in a separate property.
exports.countnotes = functions.database
	.ref("/formData/{note}")
	.onCreate(async (snap, context) => {
		const collectionRef = snap.ref.parent;
		const countRef = collectionRef.parent.child("stats").child("notes_count");

		let increment;
		// if (change.after.exists() && !change.before.exists()) {
		//   increment = 1;
		// } else if (!change.after.exists() && change.before.exists()) {
		//   increment = -1;
		// } else {
		//   return null;
		// }
		increment = 1;

		// Return the promise from countRef.transaction() so our function
		// waits for this async event to complete before it exits.
		await countRef.transaction((current) => {
			return (current || 0) + increment;
		});
		console.log("Notes Counter update");
		return null;
	});

// If the number of likes gets deleted, recount the number of likes
exports.recountnotes = functions.database
	.ref("/formData/{note}")
	.onDelete(async (snap) => {
		const noteRef = snap.ref;
		const counterRef = noteRef.parent.parent
			.child("stats")
			.child("notes_count");
		const formDataRef = noteRef.parent;
		// Return the promise from counterRef.set() so our function
		// waits for this async event to complete before it exits.
		const messagesData = await formDataRef.once("value");
		console.log("Sent Counter decount");
		return await counterRef.set(messagesData.numChildren());
	});

exports.readdnotes = functions.database
	.ref("/stats/notes_count")
	.onDelete(async (snap) => {
		const counterRef = snap.ref;
		const formDataRef = counterRef.parent.parent.child("formData");
		// Return the promise from counterRef.set() so our function
		// waits for this async event to complete before it exits.
		const messagesData = await formDataRef.once("value");
		console.log("Note Counter recount");
		return await counterRef.set(messagesData.numChildren());
	});

exports.sentCreate = functions.database
	.ref("/formData/{note}/sent")
	.onCreate(async (snap) => {
		const sentRef = snap.ref;
		const sentCountRef = sentRef.parent.parent.parent
			.child("stats")
			.child("sent_count");
		const sentVal = sentRef.val();
		await sentCountRef.transaction((current) => {
			return (current || 0) + sentVal ? 1 : 0;
		});
		console.log("Sent Counter create");
		return null;
	});

exports.sentWrite = functions.database
	.ref("/formData/{note}/sent")
	.onWrite(async (change) => {
		const latestRef = change.after.ref;
		const sentCountRef = latestRef.parent.parent.parent
			.child("stats")
			.child("sent_count");
		const latestSentVal = change.after.val();
		const oldSentVal = change.before.val();
		await sentCountRef.transaction((current) => {
			console.log("Sent counter recount");
			return (current || 0) + ((latestSentVal ? 1 : 0) - (oldSentVal ? 1 : 0));
		});

		return null;
	});

exports.sentReCount = functions.database
	.ref("/stats/sent_count")
	.onDelete(async (snap) => {
		const sentRef = snap.ref;
		const formRef = snap.ref.parent.parent.child("formData");
		const sentNotes = await formRef.orderByChild("sent").equalTo(true);
		sentNotes.on("value", async (vals) => {
			console.log("Sent Counter recount");
			return await sentRef.set(vals.numChildren());
		});
	});
