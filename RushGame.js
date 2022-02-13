import Camera_t from './PopEngine/Camera.js'
import AssetManager from './PopEngine/AssetManager.js'
import {CreateCubeGeometry} from './PopEngine/CommonGeometry.js'
import {CreateTranslationMatrix,Add3,Multiply3,Dot3,lerp,LengthSq3,Normalise3,Subtract3} from './PopEngine/Math.js'
import {CreateRandomImage} from './PopEngine/Images.js'
import {GetRandomColour} from './PopEngine/Colour.js'
import * as PopMath from './PopEngine/Math.js'
import Pop from './PopEngine/PopEngine.js'

import ParseMagicaVox from './PopEngine/MagicaVox.js'

//	adreno (quest2) has a hardware optimised clear for 0,0,0 and 1,1,1
//	somehow this should be passed from XR api/camera (default clear?)
const ClearColour = [0,0,0];

function GetStraightnessOfPoints(Positions)
{
	let Directions = [];
	for ( let i=1;	i<Positions.length;	i++ )
	{
		const Prev = Positions[i-1];
		const Next = Positions[i-0];
		const Direction = Normalise3(Subtract3(Prev,Next));
		Directions.push(Direction);
	}
	let Dots = [];
	for ( let i=1;	i<Directions.length;	i++ )
	{
		const Prev = Directions[i-1];
		const Next = Directions[i-0];
		const Dot = Dot3(Prev,Next);
		Dots.push(Dot);
	}
	
	let TotalDot = 1;
	//	mult, or average?
	for ( let Dot of Dots )
		TotalDot *= Dot;
	return TotalDot;
}

async function CreateCubeTriangleBuffer(RenderContext)
{
	const Geometry = CreateCubeGeometry(-CubeSize,CubeSize);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}


function CreateBlitGeometry()
{
	let l = 0;
	let t = 0;
	let r = 1;
	let b = 1;
	const VertexData = [	l,t,	r,t,	r,b,	r,b, l,b, l,t	];
	
	const TexCoord = {};
	TexCoord.Size = 2;
	TexCoord.Data = VertexData;

	const Geometry = {};
	Geometry.TexCoord = TexCoord;
	return Geometry;
}

async function CreateBlitTriangleBuffer(RenderContext)
{
	const Geometry = CreateBlitGeometry();
	const TriangleIndexes = undefined;
	const TriangleBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriangleBuffer;
}

let BlitCopyShader;
let BlitUpdatePositions;
let BlitUpdateVelocitys;

function GetRenderCommandsUpdatePhysicsTextures(RenderContext,PositionTexture,VelocitysTexture,TempTexture,Projectiles)
{
	const Commands = [];
	
	const BlitGeo = AssetManager.GetAsset('BlitQuad',RenderContext);
	const State = {};
	State.BlendMode = 'Blit';
	
	let TexelSize = [1.0 / PositionTexture.GetWidth(),1.0 / PositionTexture.GetHeight()];

	//	test- copy old positions to new - this is causing a glitch in position (resolition?)
	if ( false )
	{
		const CopyShader = AssetManager.GetAsset(BlitCopyShader,RenderContext);
		const Uniforms = {};
		Uniforms.SourceTexture = TempTexture;
		Commands.push(['SetRenderTarget',PositionTexture]);
		Commands.push(['Draw',BlitGeo,CopyShader,Uniforms,State]);
		return Commands;
	}

	
	//	copy old velocities to temp texture
	{
		const CopyShader = AssetManager.GetAsset(BlitCopyShader,RenderContext);
		const Uniforms = {};
		Uniforms.SourceTexture = VelocitysTexture;
		Commands.push(['SetRenderTarget',TempTexture]);
		Commands.push(['Draw',BlitGeo,CopyShader,Uniforms,State]);
	}

	//	update velocitys texture
	{
		//	get projectile data
		//	todo: sort to significant projectiles within bounds
		function CompareProjectiles(a,b)
		{
			//	temp use nearest to 0,0,0 (use spawn time?)
			let Distancea = PopMath.Length3(a.Position);
			let Distanceb = PopMath.Length3(b.Position);
			if ( Distancea < Distanceb )	return -1;
			if ( Distancea > Distanceb )	return 1;
			return 0;
		}
		const UsefulProjectiles = Projectiles.slice().sort(CompareProjectiles);
		
		function GetProjectilePos(xxx,Index)
		{
			if ( Index >= UsefulProjectiles.length )
				return [0,0,0,0];
			const Projectile = UsefulProjectiles[Index];
			return [...Projectile.Position,1];
		}
		function GetProjectilePrevPos(xxx,Index)
		{
			if ( Index >= UsefulProjectiles.length )
				return [0,0,0,0];
			const Projectile = UsefulProjectiles[Index];
			return [...Projectile.PrevPosition,1];
		}
		const MAX_PROJECTILES = 100;
		let ProjectilePrevPos = new Array(MAX_PROJECTILES).fill(0).map( GetProjectilePrevPos );
		let ProjectileNextPos = new Array(MAX_PROJECTILES).fill(0).map( GetProjectilePos );
	
		const UpdateVelocitysShader = AssetManager.GetAsset(BlitUpdateVelocitys,RenderContext);
		const Uniforms = {};
		Uniforms.OldVelocitysTexture = TempTexture;
		Uniforms.PositionsTexture = PositionTexture;
		Uniforms.ProjectilePrevPos = ProjectilePrevPos;
		Uniforms.ProjectileNextPos = ProjectileNextPos;
		Uniforms.TexelSize = TexelSize;
		Uniforms.CubeSize = CubeSize;
		Uniforms.Random4 = [Math.random(),Math.random(),Math.random(),Math.random()];
		
		Commands.push(['SetRenderTarget',VelocitysTexture]);
		Commands.push(['Draw',BlitGeo,UpdateVelocitysShader,Uniforms,State]);
	}

	//	copy old positions to temp texture
	{
		const CopyShader = AssetManager.GetAsset(BlitCopyShader,RenderContext);
		const Uniforms = {};
		Uniforms.SourceTexture = PositionTexture;
		Commands.push(['SetRenderTarget',TempTexture]);
		Commands.push(['Draw',BlitGeo,CopyShader,Uniforms,State]);
	}

	//	update positions texture
	{
		const UpdatePositionsShader = AssetManager.GetAsset(BlitUpdatePositions,RenderContext);
		const Uniforms = {};
		Uniforms.OldPositionsTexture = TempTexture;
		Uniforms.VelocitysTexture = VelocitysTexture;
		Uniforms.TexelSize = TexelSize;
		Commands.push(['SetRenderTarget',PositionTexture]);
		Commands.push(['Draw',BlitGeo,UpdatePositionsShader,Uniforms,State]);
	}
	
	return Commands;
}



class VoxelBuffer_t
{
	constructor()
	{
		this.PositionsTexture = null;
		this.TempTexture = null;
		this.VelocitysTexture = null;
		this.Colours = null;
	}
	
	LoadPositions(Positions,Colours=null,CenterPosition=[0,0,0],InitialVelocityScale=0)
	{
		//	todo: append to existing positions,
		//		need to read latest texture (async op)
		
		function GetPositon4(xxx,Index)
		{
			if ( Index >= Positions.length )
				return [0,0,0,0];
			let xyz = Positions[Index].slice(0,3);
			xyz = Add3( xyz, CenterPosition );
			return [...xyz,1];
		}

		function GetInitialVelocity4(xxx,Index)
		{
			let Scale = Math.random();
			//	make it less frequent for a high-speed fling
			Scale = Scale * Scale * Scale * Scale * Scale;
			
			Scale *= InitialVelocityScale;
			let x = Math.random()-0.5;
			let y = Math.random()-0.5;
			let z = Math.random()-0.5;
			let Gravity = 0;
			return [x*Scale,y*Scale,z*Scale,Gravity];
		}
			
		let w = PopMath.GetNextPowerOf2(Math.floor( Math.sqrt(Positions.length) ));
		let h = w;//	this could reduce until w*h < cubecount
		let Float4s = new Array(w*h).fill(0).map(GetPositon4);
		Float4s = new Float32Array(Float4s.flat(2));
		this.PositionsTexture = new Pop.Image();
		this.PositionsTexture.WritePixels( w, h, Float4s, 'Float4' );
		
		//	make this auto generative
		this.PositionsTextureUvs = [];
		for ( let y=0;	y<h;	y++ )
		{
			for ( let x=0;	x<w;	x++ )
			{
				let uv = [x/w,y/h];
				this.PositionsTextureUvs.push(uv);
			}
		}
		this.PositionsTextureUvs = this.PositionsTextureUvs.slice(0,Positions.length);
		this.PositionsTextureUvs = this.PositionsTextureUvs.flat(2);
		this.PositionsTextureUvs = new Float32Array(this.PositionsTextureUvs);
			
		//	create the temp texture (todo: should be using a pool)
		this.TempTexture = new Pop.Image();
		this.TempTexture.WritePixels( w, h, Float4s, 'Float4' );
			
		let Velocity4s = new Array(w*h).fill(0).map(GetInitialVelocity4);
		Velocity4s = new Float32Array(Velocity4s.flat(2));
		this.VelocitysTexture = new Pop.Image();
		this.VelocitysTexture.WritePixels( w, h, Velocity4s, 'Float4' );
		
		//	instancing buffer
		if ( Colours.flat )
			Colours = Colours.flat(2);
		this.Colours = new Float32Array(Colours);
	}
}


const CubeCount = 64*64;
function GetCubePositionN(xyz,Index)
{
	xyz = [0,0,0];
	const Div = Math.floor(Math.cbrt(CubeCount));
	let x = (Index % Div);
	let y = Math.floor( (Index % (Div*Div)) / Div );
	let z = Math.floor( Index / (Div*Div) );

	let Spacing = 3.0;

	x -= Div/2;
	y -= Div/2;
	z -= Div/2;
	x *= CubeSize*Spacing;
	y *= CubeSize*Spacing;
	z *= CubeSize*Spacing;
	x += xyz[0];
	y += xyz[1];
	z += xyz[2];
	
	//	add a tiny offset to make it a bit more random
	const RandomSize = CubeSize * 1.0;
	x += (Math.random() - 0.5) * RandomSize;
	y += (Math.random() - 0.5) * RandomSize;
	z += (Math.random() - 0.5) * RandomSize;
	
	//return [(Index*0.06)-0.001,0.03,0];
	
	return [x,y,z];
}

function GetCubeLocalToWorldN(xyz,Index)
{
	xyz = GetCubePositionN(xyz,Index);
	return CreateTranslationMatrix(...xyz);
}

function GetColourN(xyz,Index)
{
	if ( Index == 0 )
		return [0,1,0,0];
	let rgb = GetRandomColour();
	const r = lerp( 0.4, 0.9, Math.random() );
	const b = lerp( 0.4, 0.9, Math.random() );
	const g = lerp( 0.4, 0.9, Math.random() );
	const a = 1;
	//return [r,g,b,a];
	return [...rgb,a];
}


let CubeShader = null;
let CubePhysicsShader = null;
let AppCamera = new Camera_t();
//	try and emulate default XR pose a bit
AppCamera.Position = [0,1.5,0];
AppCamera.LookAt = [0,1.5,-1];
AppCamera.FovVertical = 80;
let DefaultDepthTexture = CreateRandomImage(16,16);
let VoxelCenterPosition = [0,0,AppCamera.LookAt[2]];//AppCamera.LookAt.slice();
let CubeSize = 0.02;


const LocalToWorldTransforms = new Float32Array( new Array(CubeCount).fill(0).map( GetCubeLocalToWorldN ).flat(2) );
const RandomColours = new Array(CubeCount).fill(0).map( GetColourN ).flat(2);


class VoxelShape_t
{
	constructor()
	{
		this.Positions = [];
		this.AddPosition([0,0,0]);
		
		let Length = 0.2;
		for ( let z=0;	z<Length;	z+=CubeSize*2 )
			this.AddPosition([0,0,-z]);
		this.Length = Length;
	}
	
	AddPosition(xyz)
	{
		this.Positions.push(xyz);
	}
}


class Weapon_t
{
	Tick(TimestepSecs,PositionInsideBounds)
	{
	}
	
	//	world space forward
	get Forward()
	{
		return this.GetWorldForward();
	}
	
	GetWorldForward(Length=1,LocalToWorld=null)
	{
		//	should use GetFirePosition()?
		if ( !LocalToWorld )
			LocalToWorld = this.GetLocalToWorldTransform();
			
		let LocalForward = this.LocalForward;
		let LocalOrigin = [0,0,0];
		LocalForward = PopMath.TransformPosition( LocalForward, LocalToWorld  );
		LocalOrigin = PopMath.TransformPosition( LocalOrigin, LocalToWorld  );
		let WorldForward = Subtract3( LocalForward, LocalOrigin );
		WorldForward = PopMath.Normalise3( WorldForward, Length );
		return WorldForward;
	}
	
	SetOriginLocalToWorld(LocalToWorld)
	{
		//	this is the wrist on hands
		this.OriginLocalToWorld = LocalToWorld;
	}
}

class WeaponWreckingProjection_t extends Weapon_t
{
	constructor(LocalOriginOffset=[0,0,0])
	{
		super();
		this.LocalForward = [0,0,-1];
		this.Shape = new VoxelShape_t();
		this.LocalToWorldTransforms = null;	//	if set, we use explicit positions instead of shape

		this.Position = [0,0,0];
		this.Rotation = [1,0,0,0,	0,1,0,0,	0,0,1,0,	0,0,0,1];
		this.LocalOriginOffset = LocalOriginOffset;
		
		//	display this hand at this distance
		this.ProjectedDistance = 15.0;
		this.ProjectedScale = 15.0;
		
		//	we save the previous ones to reduce alloc, but also to 
		//	calculate velocity (prev pos -> pos);
		this.ProjectileCaches = [];	
		
		this.OriginLocalToWorld = PopMath.CreateIdentityMatrix();
	}
	
	Fire()
	{
	}
	
	ReleaseFire()
	{
	}
	
	SetPosition(Position,Rotation)
	{
		this.Position = Position.slice();
		if ( Rotation )
			this.Rotation = Rotation.slice();
	}
	
	SetRenderLocalToWorldTransforms(Transforms)
	{
		this.Position = Transforms[0];
		this.Rotation = null;
		
		//	if we ever need to do something a bit more complex, put
		//	these into local space & into the .Shape
		this.LocalToWorldTransforms = Transforms;
		
		//	this might want to move if the positions update faster than ticks
		this.UpdateProjectiles();
	}
	
	UpdateProjectiles()
	{
		const ProjectileVelocityStretch = 10;
		function PositionToProjectile(Transform,Index)
		{
			let IsNew = false;
			if ( !this.ProjectileCaches[Index] )
			{
				const NewProjectile = new Projectile_t();
				this.ProjectileCaches[Index] = NewProjectile;
				IsNew = true;
			}
			
			const Projectile = this.ProjectileCaches[Index];
			Projectile.PrevPosition = Projectile.Position.slice();
			Projectile.LocalToWorld = Transform;
			Projectile.Position = PopMath.GetMatrixTranslation(Projectile.LocalToWorldTransform);
			if ( IsNew )
				Projectile.PrevPosition = Projectile.Position.slice();
			
			Projectile.Velocity = PopMath.Subtract3( Projectile.Position, Projectile.PrevPosition );
			Projectile.Velocity = PopMath.Multiply3( Projectile.Velocity, [ProjectileVelocityStretch,ProjectileVelocityStretch,ProjectileVelocityStretch] );
			return Projectile;
		}
		
		//	generate live projectiles
		const ProjectedPositions = this.GetProjectedLocalToWorlds();
		const Projectiles = ProjectedPositions.map(PositionToProjectile.bind(this));
		//Projectiles.forEach( EnumProjectile );
	}
	
	GetLocalToWorldTransform(LocalOffset=[0,0,0])
	{
		LocalOffset = Add3( LocalOffset, this.LocalOriginOffset );
		
		let Transforms = [];
		let LocalTrans = PopMath.CreateTranslationMatrix( ...LocalOffset );
		Transforms.push(LocalTrans);
		
		//	position is pos+rot
		if ( this.Position.length == 4*4 )
		{
			Transforms.push(this.Position);
		}
		else
		{
			let WorldTrans = PopMath.CreateTranslationMatrix( ...this.Position );
			Transforms.push(this.Rotation);
			Transforms.push(WorldTrans);
		}
		
		let LocalToWorld = PopMath.MatrixMultiply4x4Multiple( ...Transforms );
		
		return LocalToWorld;
	}
	
	GetRenderLocalToWorldTransforms()
	{
		if ( this.LocalToWorldTransforms )
			return this.LocalToWorldTransforms;

		function TransformLocalPos(LocalPosition)
		{
			let LocalToWorld = this.GetLocalToWorldTransform(LocalPosition);
			return LocalToWorld;
		}
		let LocalPositions = this.Shape.Positions;
		let LocalTransforms = LocalPositions.map( TransformLocalPos.bind(this) );
		return LocalTransforms;
	}
	
	//	these form the "projectile" projection positons
	GetProjectedLocalToWorlds()
	{
		const WorldToInputOriginSpace = PopMath.MatrixInverse4x4( this.OriginLocalToWorld );
		
		//	make the extension scale with distance from face
		let Face = [0,1.5,0];
		let InputCenter = PopMath.GetMatrixTranslation(this.OriginLocalToWorld);
		let FaceDistance = PopMath.Distance3(Face,InputCenter);
		FaceDistance *= FaceDistance;
		
		let ProjectedDistance = FaceDistance * this.ProjectedDistance;
		let ProjectedScale = FaceDistance * this.ProjectedScale;
		//let ProjectedScale = 
		
		function ProjectLocalToWorld(LocalToWorld)
		{
			//	local space transform, so it should move & scale before being attached to its normal pos
			const ProjectLocalScale = PopMath.CreateScaleMatrix( ProjectedScale,ProjectedScale,ProjectedScale );
			/*
			
			//	extend in local space or the blocks will be squashed together
			//	if we project here, we're projecting in joint-space, so don't want to
			//const ProjectLocalTrans = PopMath.CreateTranslationMatrix( 0,0,-this.ProjectedScale*0.4 );
			const ProjectLocalTrans = PopMath.CreateTranslationMatrix( 0,0,0.4 );
			
			const ProjectWorldTrans = PopMath.CreateTranslationMatrix( ...WorldOffset );
			//const NewLocalToWorld = PopMath.MatrixMultiply4x4Multiple( ProjectLocalScale, ProjectLocalTrans, LocalToWorld, ProjectWorldTrans );
			const NewLocalToWorld = PopMath.MatrixMultiply4x4Multiple( LocalToWorld, WorldToInputOriginSpace, ProjectLocalScale, ProjectLocalTrans, LocalToWorld, ProjectWorldTrans );
			return NewLocalToWorld;
			*/
			const ProjectLocalTrans = PopMath.CreateTranslationMatrix( 0,0,-ProjectedDistance );
			//	probbaly should be linked to scale and cube size?
			//	gr: this wont extend it just moves relative to wrist? though i think it should be rotated at that point...
			//const Extend = this.ProjectedScale * CubeSize * 10;
			//const ProjectLocalExtend = PopMath.CreateTranslationMatrix( 0,0,-Extend );
			const ProjectLocalExtend = PopMath.CreateTranslationMatrix( 0,0,0 );
			
			const NewLocalToWorld = PopMath.MatrixMultiply4x4Multiple( LocalToWorld, WorldToInputOriginSpace, ProjectLocalExtend, ProjectLocalScale, ProjectLocalTrans, this.OriginLocalToWorld );
			return NewLocalToWorld;
		}
		
		const LocalToWorlds = this.GetRenderLocalToWorldTransforms();
		const ProjectedLocalToWorlds = LocalToWorlds.map(ProjectLocalToWorld.bind(this));
		return ProjectedLocalToWorlds;
	}
	
	EnumProjectiles(EnumProjectile)
	{
		this.ProjectileCaches.forEach(EnumProjectile);
	}
	
	Tick(TimestepSecs,PositionInsideBounds)
	{
		//	here we should be updating prevpos of projectile
	}
}

class WeaponGun_t extends Weapon_t
{
	constructor(LocalOriginOffset=[0,0,0])
	{
		super();

		this.LastFireTimeMs = null;		//	null button is up
		this.FireRepeatPerSec = 20;
		
		this.Projectiles = [];
		
		this.LocalForward = [0,0,-1];
		this.Shape = new VoxelShape_t();
		this.LocalToWorldTransforms = null;	//	if set, we use explicit positions instead of shape
		this.Position = [0,0,0];
		this.Rotation = [1,0,0,0,	0,1,0,0,	0,0,1,0,	0,0,0,1];
		this.LocalOriginOffset = LocalOriginOffset;
	}
	
	get FireRepeatAfterMs()
	{
		return Math.floor( 1000 / this.FireRepeatPerSec );
	}
	
	ReleaseFire()
	{
		this.LastFireTimeMs = null;
	}
	
	GetFirePosition()
	{
		//	gr: slightly random offset to stop strobing positions appearing in the same place
		let End = this.Shape.Length - (Math.random()*0.20);
		const Offset = [0,0,-End];
		const Transform = this.GetLocalToWorldTransform(Offset);
		const Pos = PopMath.TransformPosition([0,0,0],Transform);
		return Pos;
	}
	
	GetLocalToWorldTransform(LocalOffset=[0,0,0])
	{
		LocalOffset = Add3( LocalOffset, this.LocalOriginOffset );
		
		let Transforms = [];
		let LocalTrans = PopMath.CreateTranslationMatrix( ...LocalOffset );
		Transforms.push(LocalTrans);
		
		//	position is pos+rot
		if ( this.Position.length == 4*4 )
		{
			Transforms.push(this.Position);
		}
		else
		{
			let WorldTrans = PopMath.CreateTranslationMatrix( ...this.Position );
			Transforms.push(this.Rotation);
			Transforms.push(WorldTrans);
		}
		
		let LocalToWorld = PopMath.MatrixMultiply4x4Multiple( ...Transforms );
		
		return LocalToWorld;
	}


	SetPosition(Position,Rotation)
	{
		this.Position = Position.slice();
		if ( Rotation )
			this.Rotation = Rotation.slice();
	}
	
	SetRenderLocalToWorldTransforms(Transforms)
	{
		this.Position = Transforms[0];
		this.Rotation = null;
		
		//	if we ever need to do something a bit more complex, put
		//	these into local space & into the .Shape
		this.LocalToWorldTransforms = Transforms;
	}
	
	GetRenderLocalToWorldTransforms()
	{
		if ( this.LocalToWorldTransforms )
			return this.LocalToWorldTransforms;

		function TransformLocalPos(LocalPosition)
		{
			let LocalToWorld = this.GetLocalToWorldTransform(LocalPosition);
			return LocalToWorld;
		}
		let LocalPositions = this.Shape.Positions;
		let LocalTransforms = LocalPositions.map( TransformLocalPos.bind(this) );
		return LocalTransforms;
	}
	
	CreateProjectile()
	{
		const ForceMetresPerSec = 20;
		const Position = this.GetFirePosition();
		const Forward = this.Forward;
		
		const Velocity = Multiply3( Forward, [ForceMetresPerSec,ForceMetresPerSec,ForceMetresPerSec] );
		this.Projectiles.push( new Projectile_t(Position, Velocity) );
	}
	
	EnumProjectiles(EnumProjectile)
	{
		this.Projectiles.forEach(EnumProjectile);
	}
	
	Fire()
	{
		this.CreateProjectile();
		this.LastFireTimeMs = Pop.GetTimeNowMs();
	}
	
	Tick(TimestepSecs,PositionInsideBounds)
	{
		this.RepeatFire();

		this.Projectiles.forEach( p => p.Move(TimestepSecs) );

		//	cull projectiles
		function ProjectileInsideBounds(Projectile)
		{
			return PositionInsideBounds(Projectile.Position);
		}
		this.Projectiles = this.Projectiles.filter(ProjectileInsideBounds.bind(this));
	}
	
	RepeatFire()
	{	
		//	repeat fire 
		if ( this.LastFireTimeMs === null )
			return;
		const Elapsed = Pop.GetTimeNowMs() - this.LastFireTimeMs;
		if ( Elapsed > this.FireRepeatAfterMs )
			this.Fire();
	}
}


function RenderCubes(PushCommand,RenderContext,CameraUniforms,CubeTransforms,CubeVelocitys)
{
	if ( !CubeTransforms.length )
		return;
		
	const Geo = AssetManager.GetAsset('Cube',RenderContext);
	const Shader = AssetManager.GetAsset(CubeShader,RenderContext);

	const Uniforms = Object.assign({},CameraUniforms);
	Uniforms.LocalToWorldTransform = CubeTransforms;
	Uniforms.WorldVelocity = CubeVelocitys;
	Uniforms.Colour = RandomColours.slice( 0, CubeTransforms.length*4 );

	const State = {};
	State.BlendMode = 'Blit';
	//State.DepthRead = false;
		
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	PushCommand( DrawCube );
}

function RenderVoxelBufferCubes(PushCommand,RenderContext,CameraUniforms,VoxelsBuffer)
{
	if ( !VoxelsBuffer )
		return;
		
	const Geo = AssetManager.GetAsset('Cube',RenderContext);
	const Shader = AssetManager.GetAsset(CubePhysicsShader,RenderContext);

	const Uniforms = Object.assign({},CameraUniforms);
	//Uniforms.LocalToWorldTransform = CubeTransforms;
	Uniforms.Colour = VoxelsBuffer.Colours;

	let PositionsTexture = VoxelsBuffer.PositionsTexture;
	let VelocitysTexture = VoxelsBuffer.VelocitysTexture;
	//	temp texture happens to have the previous positions
	let PreviousPositionsTexture = VoxelsBuffer.TempTexture;

	Uniforms.PhysicsPreviousPositionsTexture = PreviousPositionsTexture;
	Uniforms.PhysicsPositionsTexture = PositionsTexture;
	Uniforms.PhysicsPositionsTextureSize = [PositionsTexture.GetWidth(),PositionsTexture.GetHeight()];
	Uniforms.PhysicsPositionUv = VoxelsBuffer.PositionsTextureUvs;
	Uniforms.PhysicsVelocitysTexture = VelocitysTexture;
	
	const State = {};
	State.BlendMode = 'Blit';
	//State.DepthRead = false;
		
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	PushCommand( DrawCube );
}

class Projectile_t
{
	constructor(Position=[0,0,0],InitialForce=[0,0,0],GravityMult=1,Drag=0.00001)
	{
		this.PrevPosition = Position.slice();
		this.Position = Position.slice();
		this.LocalToWorld = null;	//	alternative
		
		this.Velocity = [0,0,0];
		this.Drag = Drag;
		
		let GravityPerSec = -8 * GravityMult;
		this.GravityForce = [0,GravityPerSec,0];
		this.PendingForce = InitialForce;
	}
	
	get LocalToWorldTransform()
	{
		if ( this.LocalToWorld )
			return this.LocalToWorld;
			
		const LocalToWorld = PopMath.CreateTranslationMatrix( ...this.Position );
		return LocalToWorld;
	}
	
	Move(TimestepSecs)
	{
		const Timestep3 = [TimestepSecs,TimestepSecs,TimestepSecs];
		
		//	apply drag
		const Damp = 1.0 - this.Drag;
		const Damp3 = [Damp,Damp,Damp];
		this.Velocity = Multiply3( this.Velocity, Damp3);
		
		//	apply forces
		let Force = this.PendingForce.slice();
		this.PendingForce = [0,0,0];
		Force = Add3( Force, Multiply3( this.GravityForce, Timestep3 ) );
		
		this.Velocity = Add3( this.Velocity, Force );
	
		let Delta = Multiply3( this.Velocity, Timestep3 );
		
		this.PrevPosition = this.Position.slice();
		this.Position = Add3( this.Position, Delta );
	}
}

class Game_t
{
	constructor()
	{
		this.Weapons = {};	//	named weapons for different inputs
		this.Projectiles = [];
		this.WorldBoundsSphere = [0,0,0,50];
		//	projectiles are being culled before they get tested in physics
		this.WorldBoundsFloorY = -3;
	}
	
	GetWeapons()
	{
		return Object.values(this.Weapons);
	}
	
	GetWeapon(Name)
	{
		if ( !this.Weapons[Name] )
		{
			const Offset = (Name=='Desktop') ? [0,-0.15,0.3] : [0,0,0];
			console.log(`Creating weapon ${Name}`);
			const WeaponType = Name.startsWith('left') ? WeaponWreckingProjection_t : WeaponGun_t;
			this.Weapons[Name] = new WeaponType(Offset);
		}
		return this.Weapons[Name];
	}
	
	EnumProjectiles(EnumProjectile)
	{
		this.Projectiles.forEach( EnumProjectile );
		for ( let Weapon of Object.values(this.Weapons) )
		{
			Weapon.EnumProjectiles(EnumProjectile);
		}
	}
	
	CreateProjectile(Position,Forward,Force)
	{
		const Velocity = Multiply3( Forward, [Force,Force,Force] );
		this.Projectiles.push( new Projectile_t(Position, Velocity) );
	}
	
	OnFireWeapon(Weapon)
	{
		Weapon.Fire();
	}
		
	OnDesktopFireDown()
	{
		const Weapon = this.GetWeapon('Desktop');
		Weapon.Fire();
	}
	
	OnDesktopFireUp()
	{
		const Weapon = this.GetWeapon('Desktop');
		Weapon.ReleaseFire();
	}
	
	
	UpdateWeaponDesktop(Camera)
	{
		const Weapon = this.GetWeapon('Desktop');
		//	forward seems right on webxr camera/transform, but not our camera...
		Weapon.LocalForward = [0,0,1];
		let Rotation = Camera.GetLocalRotationMatrix();
		Rotation = PopMath.MatrixInverse4x4( Rotation );
		let Position = Camera.Position;
		//let Position = Subtract3( [0,0,0], Camera.Position );
		//Position = Add3( Position, [0,-0.3,0.0] );
		Weapon.SetPosition( Position, Rotation );
	}
	
	PositionInsideBounds(Position)
	{
		if ( Position[1] < this.WorldBoundsFloorY )
			return false;
		let Distance = PopMath.Distance3(Position,this.WorldBoundsSphere);
		return Distance <= this.WorldBoundsSphere[3]; 
	}
	
	Tick(TimestepSecs)
	{
		for ( let Projectile of this.Projectiles )
		{
			Projectile.Move(TimestepSecs);
		}

		function ProjectileInsideBounds(Projectile)
		{
			return this.PositionInsideBounds(Projectile.Position);
		}
		//	cull old projectiles
		this.Projectiles = this.Projectiles.filter(ProjectileInsideBounds.bind(this));

		//	repeat fire weapons
		const Weapons = this.GetWeapons();
		Weapons.forEach( w => w.Tick(TimestepSecs,this.PositionInsideBounds.bind(this)) );
	}
	
	
	GetPhysicsRenderCommands(RenderContext,TimestepSecs)
	{
		const Projectiles = [];
		this.EnumProjectiles( p => Projectiles.push(p) );
		
		const Commands = [];
		for ( let VoxelBuffer of this.VoxelBuffers )
		{
			const SomeCommands = GetRenderCommandsUpdatePhysicsTextures( RenderContext, VoxelBuffer.PositionsTexture, VoxelBuffer.VelocitysTexture, VoxelBuffer.TempTexture, Projectiles );
			Commands.push(...SomeCommands);
		}
		return Commands;
	}
	
	//	gr: this should really return commands?
	//		depends if we need to read it back...
	async GpuTick(RenderContext,TimestepSecs)
	{
		//	generate rendercommands then run them
		const Commands = this.GetPhysicsRenderCommands(RenderContext,TimestepSecs);
		//	also... dont need to wait if we're not reading stuff back
		//	this causes 2 waits for animations
		//await RenderContext.Render(Commands);
		RenderContext.Render(Commands);
	}
	
	async WaitForEnemniesDestroyed()
	{
		let x = 999;
		while ( x != 0 )
			await Pop.Yield(999*10000);
	}
	
	async LoadLevel()
	{
		//	generate voxel enemies
		this.VoxelBuffers = [];
		
		const LoadTaxi = true;//Pop.GetExeArguments().Taxi;
		
		if ( !LoadTaxi )
		{
			let Positions = new Array(CubeCount).fill(0).map(GetCubePositionN);
			let Voxels = new VoxelBuffer_t();
			Voxels.LoadPositions( Positions, RandomColours, VoxelCenterPosition, 0.4 );
			this.VoxelBuffers.push(Voxels);
		}
		
		if ( LoadTaxi )
		{
			const VoxContents = await Pop.FileSystem.LoadFileAsArrayBufferAsync(`Models/Taxi.vox`);
			const Geometry = await ParseMagicaVox( VoxContents );
			let Voxels = new VoxelBuffer_t();
			
			const SkipEveryX = 0;
			
			function TweakPosition(xyz,Index)
			{
				if ( SkipEveryX!=0 && Index % SkipEveryX == 0 )
					return null;
				let Scale = [CubeSize*2,CubeSize*2,CubeSize*2];
				
				xyz = Multiply3( xyz, Scale );
				xyz = Add3( xyz, VoxelCenterPosition );
				return xyz;
			}
			
			function TweakColour(rgba,Index)
			{
				if ( SkipEveryX!=0 && Index % SkipEveryX == 0 )
					return null;
				let ToneChange = (Math.random()-0.5)*0.10;
				rgba[0] += ToneChange;
				rgba[1] += ToneChange;
				rgba[2] += ToneChange;
				return rgba;
			}
			Geometry.Colours = Geometry.Colours.map(TweakColour).filter( x=>x != null );
			Geometry.Positions = Geometry.Positions.map(TweakPosition).filter( x=>x != null );
			
			Geometry.Colours = new Float32Array(Geometry.Colours.flat(2));
			
			Voxels.LoadPositions( Geometry.Positions, Geometry.Colours, VoxelCenterPosition, 0.0 );
			this.VoxelBuffers.push(Voxels);
		}
			
	}
	
	async RunGameIteration()
	{
		//	show hello
		//	load assets
		await this.LoadLevel();
		//	wait for all enemies shot
		await this.WaitForEnemniesDestroyed();
		//	show game over
	}
}


export default class App_t
{
	constructor()
	{
		this.RegisterAssets();
		this.Game = new Game_t();
	}
	
	get Camera()	{	return AppCamera;	}
	
	RegisterAssets()
	{
		if ( CubeShader )
			return;
		AssetManager.RegisterAssetAsyncFetchFunction('Cube', CreateCubeTriangleBuffer );
		AssetManager.RegisterAssetAsyncFetchFunction('BlitQuad', CreateBlitTriangleBuffer );

		const VertFilename = 'Geo.vert.glsl';
		const FragFilename = 'Colour.frag.glsl';
		CubeShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename);

		const VertPhysicsFilename = 'PhysicsGeo.vert.glsl';
		CubePhysicsShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertPhysicsFilename);

		const VertBlitQuadFilename = 'BlitQuad.vert.glsl';
		BlitCopyShader = AssetManager.RegisterShaderAssetFilename('BlitCopy.frag.glsl',VertBlitQuadFilename);
		BlitUpdatePositions = AssetManager.RegisterShaderAssetFilename('BlitUpdatePositions.frag.glsl',VertBlitQuadFilename);
		BlitUpdateVelocitys = AssetManager.RegisterShaderAssetFilename('BlitUpdateVelocitys.frag.glsl',VertBlitQuadFilename);
	}
	
	BindXrControls(Device)
	{
		const Game = this.Game;
		Device.OnMouseMove = function(xyz,Button,InputName,Transform,ExtraData)
		{
			//	false when not tracking
			if ( !Transform )
				return;

			const Weapon = Game.GetWeapon(InputName);
			let Rotation = Transform.matrix;
			PopMath.SetMatrixTranslation(Rotation,0,0,0,1);
		
			Weapon.SetPosition(xyz,Rotation);

			//	if hand, use all the points
			if ( ExtraData && ExtraData.LocalToWorlds )
			{
				Weapon.SetRenderLocalToWorldTransforms( ExtraData.LocalToWorlds );
			}
			if ( ExtraData && ExtraData.InputOriginLocalToWorld )
			{
				Weapon.SetOriginLocalToWorld(ExtraData.InputOriginLocalToWorld);
			}

			//	if this is a hand, it has extra positions;
			//	if the finger is outstretched, treat it as a button press
			//	dont fire from thumb
			const IsThumb = InputName.includes('thumb');
			if ( ExtraData && ExtraData.LocalToWorlds && !IsThumb )
			{
				const Weapon = Game.GetWeapon(InputName);
				const Positions = ExtraData.LocalToWorlds.map( PopMath.GetMatrixTranslation );
				const Straightness = GetStraightnessOfPoints(Positions);
				if ( Straightness > 0.85 )
				{
					Game.OnFireWeapon(Weapon);
				}
				else
				{
					Weapon.ReleaseFire();
				}
			}

		}
		
		Device.OnMouseDown = function(xyz,Button,InputName,Transform)
		{
			//	update position as move isn't called when mouse is down
			Device.OnMouseMove( ...arguments );
			
			const Weapon = Game.GetWeapon(InputName);
			Game.OnFireWeapon(Weapon);
		}

		Device.OnMouseUp = function(xyz,Button,InputName,Transform)
		{
			const Weapon = Game.GetWeapon(InputName);
			Weapon.ReleaseFire();
		}
	}
	
	BindMouseCameraControls(RenderView)
	{
		const Camera = this.Camera;
		const Game = this.Game;
		
		RenderView.OnMouseDown = function(x,y,Button,FirstDown=true)
		{
			if ( Button == 'Left' )
			{
				if ( FirstDown )
					Game.OnDesktopFireDown();
			}
			
			if ( Button == 'Right' )
				Camera.OnCameraFirstPersonRotate( x, y, 0, FirstDown!=false );
			
			if ( Button == 'Middle' )
				Camera.OnCameraPan( x, y, 0, FirstDown!=false );
		}
		
		RenderView.OnMouseMove = function(x,y,Button)
		{
			RenderView.OnMouseDown( x, y, Button, false );
		}
		
		RenderView.OnMouseScroll = function(x,y,Button,Delta)
		{
			Camera.OnCameraPanLocal( x, y, 0, true );
			Camera.OnCameraPanLocal( x, y, -Delta[1] * 10.0, false );
			//Camera.OnCameraZoom( -Delta[1] * 0.1 );
		}
		
		RenderView.OnMouseUp = function(x,y,Button)
		{
			if ( Button == 'Left' )
				Game.OnDesktopFireUp();
		}
	}
	
	GetDesktopRenderCommands(RenderContext,RenderView)
	{
		//	update camera
		const Viewport = RenderView.GetScreenRect();
		
		return this.GetSceneRenderCommands( RenderContext, this.Camera, Viewport );
	}
	
	GetXrRenderCommands(RenderContext,Camera)
	{
		return this.GetSceneRenderCommands(...arguments);
	}
	
	GetSceneRenderCommands(RenderContext,Camera,Viewport=[0,0,1,1])
	{
		//	make screen camera track xr camera
		AppCamera.Position = Camera.Position.slice();
		AppCamera.LookAt = Camera.LookAt.slice();
		
		this.RegisterAssets();
		
		
		const ClearCommand = ['SetRenderTarget',null,ClearColour];

		const CameraUniforms = {};
		//	normalise viewport
		Viewport[0] = 0;
		Viewport[1] = 0;
		Viewport[3] /= Viewport[2];
		Viewport[2] /= Viewport[2];
		CameraUniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
		CameraUniforms.CameraToWorldTransform = Camera.GetLocalToWorldMatrix();
		CameraUniforms.CameraProjectionTransform = Camera.GetProjectionMatrix(Viewport);
		CameraUniforms.DepthTexture = Camera.DepthImage || DefaultDepthTexture;
		CameraUniforms.NormalDepthToViewDepthTransform = CameraUniforms.DepthTexture.NormalDepthToViewDepthTransform || [];


		const CubeCommands = [];
		function PushCommand(Command)
		{
			CubeCommands.push(Command);
		}
		
		for ( let Voxels of this.Game.VoxelBuffers )
		{
			RenderVoxelBufferCubes( PushCommand, RenderContext, CameraUniforms, Voxels );
		}
		
		this.Game.UpdateWeaponDesktop(Camera);
		
		for ( let Weapon of this.Game.GetWeapons() )
		{
			const Positions = Weapon.GetRenderLocalToWorldTransforms();
			const Velocitys = new Array(Positions.length).fill([0,0,0]);
			RenderCubes( PushCommand, RenderContext, CameraUniforms, Positions, Velocitys );
		}
		
		{
			let Transforms = [];
			let Velocitys = [];
			function OnProjectile(Projectile)
			{
				Transforms.push( Projectile.LocalToWorldTransform );
				Velocitys.push( Projectile.Velocity );
			}
			this.Game.EnumProjectiles(OnProjectile);
			RenderCubes( PushCommand, RenderContext, CameraUniforms, Transforms, Velocitys );
		}
		

		return [ClearCommand,...CubeCommands];
	}
	
	Tick(TimestepSecs)
	{
		this.Game.Tick(TimestepSecs);
	}
	
	async GpuTick(RenderContext,TimestepSecs)
	{
		return this.Game.GpuTick(RenderContext,TimestepSecs);
	}
	
	async GameIteration()
	{
		//	create game
		await this.Game.RunGameIteration();
	}
}
